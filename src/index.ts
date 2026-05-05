import * as bin from '@isopodlabs/binary';
import { bitsin, bitsin2, bitsin3, BS, MC, MCS, ASyncReader, VER, Obj, ObjControl, OBJECTTYPE, H, UCSstuff, HeaderVars, MoveableClass} from './core';
import { get_object } from './core';
import { openDWG } from './readers';
import {CRC16} from './crc16';



const header_sentinel		= new Uint8Array([0xCF, 0x7B, 0x1F, 0x23, 0xFD, 0xDE, 0x38, 0xA9, 0x5F, 0x7C, 0x68, 0xB8, 0x4E, 0x6D, 0x33, 0x5F]);
const header_sentinel_end	= new Uint8Array([0x30, 0x84, 0xE0, 0xDC, 0x02, 0x21, 0xC7, 0x56, 0xA0, 0x83, 0x97, 0x47, 0xB1, 0x92, 0xCC, 0xA0]);
const classes_sentinel		= new Uint8Array([0x8D, 0xA1, 0xC4, 0xB8, 0xC4, 0xA9, 0xF8, 0xC5, 0xC0, 0xDC, 0xF4, 0x5F, 0xE7, 0xCF, 0xB6, 0x8A]);
const classes_sentinel_end	= new Uint8Array([0x72, 0x5E, 0x3B, 0x47, 0x3B, 0x56, 0x07, 0x3A, 0x3F, 0x23, 0x0B, 0xA0, 0x18, 0x30, 0x49, 0x75]);

async function check_sentinels(r: ASyncReader | undefined, sentinel: Uint8Array, sentinel_end: Uint8Array): Promise<Buffer|undefined> {
	if (!r)
		return;

	const sect	= bin.read(new bin.stream(await r.all()), {
		sentinel:		bin.Buffer(16),
		data:			bin.Buffer(bin.UINT32),
		unk:			bin.UINT16,
		sentinel_end:	bin.Buffer(16)
	});

	for (let i = 0; i < sentinel.length; i++) {
		if (sect.sentinel[i] !== sentinel[i] || sect.sentinel_end[i] !== sentinel_end[i])
			return;
	}
	return Buffer.from(sect.data);
}

class ObjectHandle {
	ref?: WeakRef<Obj>;
	get obj()					{ return this.ref?.deref(); }
	set obj(obj: Obj|undefined)	{ this.ref = obj ? new WeakRef(obj) : undefined; }

	constructor(public h: number, public loc: number) {}
	compareTo(o: number) {
		return this.h < o ? -1 : this.h > o ? 1 : 0;
	}
};

class Table {
	control?: ObjControl;

	constructor(public ctype: OBJECTTYPE) {}

	async init(dwg: DWG, ctrl: H) {
		this.control = await dwg.get_object(ctrl.offset()) as ObjControl;
	}
	async *iterate(dwg: DWG) {
		for (const h of this.control!.handles)
			yield await dwg.get_object(h);
	}
}

export class DWG {
	code_page		= 0;
	version: VER	= VER.BAD;
	maintenanceVersion = 0;
	comments		= '';
	name			= '';
	ucs!:			UCSstuff;
	vars!:			HeaderVars;
	classes			= new Map<OBJECTTYPE, MoveableClass>;
	handles: ObjectHandle[] = [];
	objectfile?:	ASyncReader;
	
	blocks			= new Table(OBJECTTYPE.BLOCK_CONTROL_OBJ);
	layers			= new Table(OBJECTTYPE.LAYER_CONTROL_OBJ);
	textstyles 		= new Table(OBJECTTYPE.STYLE_CONTROL_OBJ);
	linetypes		= new Table(OBJECTTYPE.LTYPE_CONTROL_OBJ);
	views			= new Table(OBJECTTYPE.VIEW_CONTROL_OBJ);
	ucss			= new Table(OBJECTTYPE.UCS_CONTROL_OBJ);
	vports			= new Table(OBJECTTYPE.VPORT_CONTROL_OBJ);
	appids			= new Table(OBJECTTYPE.APPID_CONTROL_OBJ);
	dimstyles		= new Table(OBJECTTYPE.DIMSTYLE_CONTROL_OBJ);
	vpEntHeaders	= new Table(OBJECTTYPE.VP_ENT_HDR_CTRL_OBJ);
	groups			= new Table(OBJECTTYPE.DICTIONARY);
	mlinestyles		= new Table(OBJECTTYPE.DICTIONARY);
	layouts			= new Table(OBJECTTYPE.DICTIONARY);
	plotsettings	= new Table(OBJECTTYPE.DICTIONARY);
	ready?:			Promise<boolean>;

	async get_object(handle: number) {
		const i = this.handles.findIndex(h => h.h === handle);
		if (i < 0)
			return undefined;

		const	mit	= this.handles[i];
		let		obj = mit.obj;
		if (!obj) {
			const bits2 = await get_object(this.objectfile!, mit.loc, this.version);
			if (bits2) {
				let		type	= OBJECTTYPE.get(bits2);
				bits2.seek_bit(0);

				if (type && type.index >= OBJECTTYPE._LOOKUP.index) {
					const it = this.classes.get(type);
					type = it ? OBJECTTYPE.FromInt(it.type) : undefined;
				}
				if (type)
					mit.obj	= obj = new type(bits2);
			}
		}
		return obj;
	}

	read_handles(file: bin.stream) {
		while (file.remaining()) {
			const size = bin.UINT16_BE.get(file);
			file.skip(-2);
			const temp	= file.read_buffer(size);
			const mr2	= new bin.stream(temp);
			mr2.seek(2);
			let handle	= 0;
			let loc		= 0;
			while (mr2.remaining()) {
				handle	+= MC.get(mr2);
				loc		+= MCS.get(mr2);
				this.handles.push(new ObjectHandle(handle, loc));
			}
			const crc16		= new CRC16(0xc0c1);
			crc16.updateBuffer(temp);
			if (crc16.getValue() !== bin.UINT16_BE.get(file))
				throw new Error('CRC mismatch');
		}
	}

	read_classes(bits: bitsin2, bitsize: number) {
		while (bits.tell_bit() < bitsize)
			this.classes.set(OBJECTTYPE.FromInt(BS.get(bits))!, MoveableClass.get(bits));
	}

	async read_tables() {
		this.blocks 		.init(this, this.vars.BLOCK_CONTROL);
		this.layers 		.init(this, this.vars.LAYER_CONTROL);
		this.textstyles 	.init(this, this.vars.TEXTSTYLE_CONTROL);
		this.linetypes 		.init(this, this.vars.LINETYPE_CONTROL);
		this.views 			.init(this, this.vars.VIEW_CONTROL);
		this.ucss 			.init(this, this.vars.UCS_CONTROL);
		this.vports 		.init(this, this.vars.VPORT_CONTROL);
		this.appids 		.init(this, this.vars.APPID_CONTROL);
		this.dimstyles 		.init(this, this.vars.DIMSTYLE_CONTROL);

		if (this.vars.VP_ENT_HDR_CONTROL)
			this.vpEntHeaders.init(this, this.vars.VP_ENT_HDR_CONTROL);

		this.groups			.init(this, this.vars.GROUP_CONTROL);
		this.mlinestyles	.init(this, this.vars.MLINESTYLE_CONTROL);
		if (this.vars.LAYOUTS_CONTROL)
			this.layouts	.init(this, this.vars.LAYOUTS_CONTROL);
		if (this.vars.PLOTSETTINGS_CONTROL)
			this.plotsettings.init(this, this.vars.PLOTSETTINGS_CONTROL);
	}

	constructor(filename?: string) {
		if (filename) {
			this.ready = openDWG(filename).then(async reader => {
				if (reader) {
					this.version = reader.version;

					const header	= await check_sentinels(reader.reader("AcDb:Header"), header_sentinel, header_sentinel_end);
					if (!header)
						return false;

					const classes	= await check_sentinels(reader.reader("AcDb:Classes"), classes_sentinel, classes_sentinel_end);
					if (!classes)
						return false;

					const handles	= reader.reader("AcDb:Handles");
					if (!handles)
						return false;

					const objects	= reader.reader("AcDb:AcDbObjects");
					if (!objects)
						return false;

					this.objectfile = objects;

					this.vars		= new HeaderVars(new bitsin3(new bitsin2(new bitsin(header, this.version))));
					this.read_classes(new bitsin2(new bitsin(classes, this.version)), (classes.length - 1) * 8);
					this.read_handles(new bin.stream(await handles.all()));
					this.read_tables();
					return true;
				}
				return false;
			});
		}
	}

};

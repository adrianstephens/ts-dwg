import * as bin from '@isopodlabs/binary';
import {CRC16} from './crc16';

export interface ASyncReader {
	size: bigint;
	read_buffer(offset: bigint, len: number) : Promise<Buffer>;
	all() : Promise<Buffer>;
}


const VERS = {
	BAD:		0,
	R13:		1012,
	R14:		1014,
	R2000:		1015,
	R2004:		1018,
	R2007:		1021,
	R2010:		1024,
	R2013:		1027,
	R2018:		1032,
	MIN_VER:	1012,
	MAX_VER:	1032,
};
export type VER	= typeof VERS[keyof typeof VERS];
export const VER = Object.assign(VERS, {
	FromInt(id: number) {
		for (const e of Object.values(VER)) {
			if (typeof e === 'number' && e === id)
				return e;
		}
		return VER.BAD;
	}
});


type reader = bin._stream;

type IntRange<N extends number, Acc extends number[] = []> = Acc['length'] extends N ? Acc[number] : IntRange<N, [...Acc, Acc['length']]>;
type Pow2<N extends number, Acc extends unknown[] = [0], I extends unknown[] = []> = I['length'] extends N ? Acc['length'] : Pow2<N, [...Acc, ...Acc], [...I, 0]>;
type Gt<A extends number, B extends number, T extends unknown[] = []> = T['length'] extends B ? (T['length'] extends A ? false : true) : T['length'] extends A ? false : Gt<A, B, [...T, 0]>;
type Bits<N extends number> = number extends N ? number : Gt<N, 8> extends true ? number : IntRange<Pow2<N>>;

export interface bit_reader extends reader {
	ver(v: VER):	number;
	get_bit():		boolean;
	get_bits<N extends number>(n: N): Bits<N>;
	get_bits(n: number): number;
	get_bits(n: number): number;
	tell_bit():		number;
	seek_bit(offset: number): void;
	seek_cur_bit(offset: number): void;
	with_flag(value: number): number;
}

export function ver(s: reader, v: VER) {
	return (s as bit_reader).ver(v);
}
export function minVer<T extends bin.Type, F extends bin.Type | undefined = undefined>(v: VER, type: T, false_type?: F)
	: bin.TypeT<F extends bin.Type ? bin.ReadType<T | F> : bin.ReadType<T> | undefined> {
	return bin.Optional(s => ver(s, v) >= 0, type, false_type);
}
export function maxVer<T extends bin.Type, F extends bin.Type | undefined = undefined>(v: VER, type: T, false_type?: F)
	: bin.TypeT<F extends bin.Type ? bin.ReadType<T | F> : bin.ReadType<T> | undefined> {
	return bin.Optional(s => ver(s, v) <= 0, type, false_type);
}

// -----------------------------------------------------------------------------
// bit_reader implementations
// -----------------------------------------------------------------------------

class memory_bits_reader {
	p		= 0;

	constructor(public b: Uint8Array) {}
	remaining(): number {
		return this.b.length - this.tell();
	}
	tell(): number {
		return (this.p + 7) >> 3;
	}
	seek(offset: number): void {
		this.p = Math.min(offset, this.b.length) << 3;
	}
	tell_bit(): number {
		return this.p;
	}
	seek_bit(offset: number): void {
		this.p = Math.min(offset, this.b.length << 3);
	}
	seek_cur_bit(offset: number): void {
		this.seek_bit(this.tell_bit() + offset);
	}
	get_bit(): boolean {
		const bit	= this.p & 7;
		const ret	= ((this.b[this.p >> 3] >> (7 - bit)) & 1) !== 0;
		++this.p;
		return ret;
	}
	get_bits<N extends number>(n: N): Bits<N>;
	get_bits(n: number): number;
	get_bits(n: number): number {
		const bit	= (this.p & 7) + n;
		const p		= this.p >> 3;
		const ret	= bit <= 8
			? (this.b[p] >> (8 - bit))
			: (this.b[p] << (bit - 8)) | (this.b[p + 1] >> (16 - bit));
		this.p		+= n;
		return ret & ((1 << n) - 1);
	}
	skip(offset: number) {
		this.seek((this.p + 7 + (offset << 3)) & ~7);
		return this;
	}
	align(align: number) {
		const offset = this.tell() % align;
		if (offset)
			this.skip(align - offset);
	}
	read_buffer(len: number) {
		return this.view(Uint8Array, len);
		//const offset = this.p;
		//this.seek(offset + len);
		//return new Uint8Array(this.b.buffer, offset, this.p - offset);
	}
	write_buffer(v: Uint8Array) {
	}

	remainder() {
		return new Uint8Array(this.b.buffer, this.p);
	}
	view<T>(view: bin.View<T>, len: number) {
		if (this.tell() + len > this.b.length)
			throw new Error('stream: out of bounds');
		
		const bit	= this.p & 7;
		const p		= this.p >> 3;
		this.p		+= len << 3;

		if (bit) {
			const t = new Uint8Array(len);
			for (let i = 0; i < len; i++)
				t[i] = ((this.b[p + i] << 8) | this.b[p + i + 1]) >> (8 - bit);
			return new view(t.buffer, 0, len);
		} else {
			return new view(this.b.buffer, this.p, len);
		}
	}
	with_flag(value: number) {
		return this.get_bit() ? value : 0;
	}
}

export class bitsin extends memory_bits_reader implements bit_reader {
	constructor(b: Uint8Array, public v: VER, public size = 0) {
		super(b);
	}
	ver(v: VER): number {
		return this.v - v;
	}
	dup() {
		const dup = new bitsin(this.b, this.v, this.size);
		dup.p = this.p;
		return dup;
	}
}

// bitsin with sbits (reader for strings)
export class bitsin2 extends bitsin {
	sbits: bitsin;
	soffset = 0;

	constructor(bits: bitsin, sbits?: bitsin, soffset?: number) {
		super(bits.b, bits.v, bits.size);
		this.p		= bits.p;

		if (sbits) {
			this.sbits		= sbits;
			this.soffset	= soffset ?? 0;
			this.sbits.seek_bit(this.soffset);
		} else {
			this.sbits = bits;
		}
	}
	check_skip_strings(): boolean {
		if (this.soffset !== 0 && this.tell_bit() !== this.soffset)
			return false;
		if (this !== this.sbits)
			return this.sbits.tell_bit() === this.size - 17;
		return this.sbits.tell_bit() === this.size;
	}
}

// bitsin with sbits and hbits (reader for handles)
export class bitsin3 extends bitsin2 {
	hbits: bitsin;
	constructor(bits: bitsin2, hbits?: bitsin) {
		super(bits);
		this.hbits = hbits ?? bits;
	}
}

export const U8	= bin.UINT8;
export const U16	= bin.UINT16;
export const U32	= bin.UINT32;
export const F64	= bin.Float64;

export interface Vec2 { x: number, y: number}
export interface Vec3 { x: number, y: number, z: number}

export const RD2 = bin.StructT<Vec2>({x: F64, y: F64});
export const RD3 = bin.StructT<Vec3>({x: F64, y: F64, z: F64});

export const B = {
	get(s: bit_reader) { return s.get_bit(); },
	put(_s: reader) {}
};

export function Bits<const N extends number>(n: N) {
//function Bits(n: number) {
	return {
		get(s: bit_reader) { return s.get_bits(n as N); },
		put(_s: reader) {}
	};
};
export function DiscardBits(n: number) {
	return {
		get(s: bit_reader) { return s.seek_cur_bit(n); },
		put(_s: reader) {}
	};
};

export const BS = {
	get(s: bit_reader) {
		switch (s.get_bits(2)) {
			case 0: return U16.get(s);
			case 1: return U8.get(s);
			case 2: return 0;
			case 3: return 256;
		}
	},
	put(_s: reader) {}
};

export const BSV = {
	get(s: bit_reader) {
		return s.ver(VER.R2000) < 0 ? U8.get(s) : BS.get(s);
	}
};
export const BL = {
	get(s: bit_reader) {
		switch (s.get_bits(2)) {
			case 0: return U32.get(s);
			case 1: return U8.get(s);
			default:
			case 2: return 0;
		}
	},
	put(_s: reader, _v: any) {}
};
const BLL = {
	get(s: bit_reader) {
		const n = s.get_bits(3);
		let v = 0;
		for (let i = 0; i < n; i++)
			v = (v << 8) | U8.get(s);
		return v;
	}
};

export const BD = {
	get(s: bit_reader): number {
		const inb = s as bit_reader;
		switch (inb.get_bits(2)) {
			case 0: return bin.Float64.get(inb);
			case 1: return 1;
			default:
			case 2: return 0;
		}
	},
	put(_s: reader, _v: any) {}
};

export const BD2 = bin.StructT<Vec2>({x: BD, y: BD});
export const BD3 = bin.StructT<Vec3>({x: BD, y: BD, z: BD});

export const BDV = {
	get(s: bit_reader): number {
		return s.ver(VER.R2000) >= 0 ? bin.Float64.get(s) : BD.get(s);
	},
	put(_s: bit_reader) {}
};

// BitExtrusion
export const BEXT = {
	get(s: bit_reader) {
		return s.ver(VER.R2000) >= 0 && s.get_bit() ? {x: 0, y: 0, z: 0} : BD3.get(s);
	},
	put(_s: reader) {}
};

// BitDouble With Default
function DDadjust(s: reader, v: number): number {
	const inb		= s as bit_reader;
	const view		= new DataView(new ArrayBuffer(8));
	view.setFloat64(0, v, true);
	
	function read_buffer_to(offset: number, len: number) {
		const b = inb.view(Uint8Array, len);
		for (let i = 0; i < len; i++)
			view.setUint8(offset + i, b[i]);
	}

	switch (inb.get_bits(2)) {
		case 0:
			break;
		case 1:
			read_buffer_to(0, 4);
			break;
		case 2:
			// Read 2 + 4 bytes
			read_buffer_to(4, 2);
			read_buffer_to(0, 4);
			break;
		case 3:
			// Read 8 bytes
			read_buffer_to(0, 8);
			break;
	}
	return view.getFloat64(0, true);
}

function DDadjustN(s: reader, n: number): number[] {
	const inb = s as bit_reader;
	const out = Array<number>(n);
	out[0] = F64.get(inb);
	for (let i = 1; i < n; i++)
		out[i] = DDadjust(inb, out[i - 1]);
	return out;
}

function DDadjustRecord(s: reader, def: Record<string, number>) {
	const inb = s as bit_reader;
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(def))
		out[k] = DDadjust(inb, v);
	return out;
}

const BSCALE = {
	get(bits: bit_reader) {
		if (bits.ver(VER.R14) <= 0)
			return bin.read(bits, BD3);

		let x = 0;
		switch (bits.get_bits(2)) {
			case 0:
				x = F64.get(bits);
			// fallthrough
			case 1: {
				const y = DDadjust(bits, x);
				const z = DDadjust(bits, x);
				return {x, y, z};
			}
			case 2:
				x = F64.get(bits);
				return {x, y: x, z: x};
			case 3:
				return {x: 0, y: 0, z: 0};
		}
	}
};
const BT = {
	get(s: bit_reader) {
		return s.ver(VER.R2000) >= 0 && s.get_bit() ? 0 : bin.read(s, BD);
	},
	put(_s: reader) {}
};

export class H extends bin.Class({
	v: BL
}) {
	static AddOne	  = 0x00;
	static SubOne	  = 0x01;
	static AddOffset   = 0x02;
	static SubOffset   = 0x03;
	static Null		= 0xFF;
	static XRef		= 0xFE;
	static SoftPointer = 0x40;
	static HardPointer = 0x80;
	static SoftOwner   = 0xC0;
	static HardOwner   = 0xA0;

	code():		number { return this.v & 0x03; }
	offset():	number { return this.v >> 2; }
	get_offset(href: number): number {
		switch (this.code()) {
			case H.AddOne:	return href + 1;
			case H.SubOne:	return href - 1;
			case H.AddOffset: return href + this.offset();
			case H.SubOffset: return href - this.offset();
			default:		  return this.offset();
		}
	}
}

class HandleRange {
	handles: H[];
	constructor(bits: bit_reader, count: number) {
		this.handles = count < 0 ? [] : bin.readn(bits, H, bits.ver(VER.R2004) >= 0 ? count + 1 : 3);
	}
	endH(): InstanceType<typeof H> { return this.handles[this.handles.length - 1]; }
	collection(h: number): Iterator<Obj> {
		const	handles = this.handles;
		let		i = handles[0].get_offset(h);
		const	e = handles[1].get_offset(h);
		return {
			next(): IteratorResult<Obj> {
				if (i != e) {
					++i;
					return {done: false, value: undefined!};//get_object(handles[i++].offset())};
				} else {
					return {done: true, value: undefined!};
				}
			}
		};
	}
	static read(count: bin.TypeX<number>) {
		return {
			get(s: bit_reader) {
				return new HandleRange(s, bin.readx(s, count));
			}
		};
	}
};

export const TV = bin.StringType(BS, 'utf8');

export class CMC extends bin.Class({
	index:		BS,
	rgb:		minVer(VER.R2000, BL),
	name:		minVer(VER.R2000, bin.Optional(U8, TV))
}) {
	static ByLayer	= 0xC0;
	static ByBlock	= 0xC1;
	static RGB		= 0xC2;
	static ACIS		= 0xC3;
};

class ENC extends bin.ReadClass({
	flags:		BS,
	rgb:		bin.Optional(s =>  s.obj.flags?.v & 0x8000, BL),
	h:			bin.Optional(s =>  (s.obj.flags?.v & 0xC000) === 0xC000, H),
	transparency: bin.Optional(s =>  s.obj.flags?.v & 0x2000, BL)
}) {
	static Complex = 0x8000;
	static AcDbRef = 0x4000;
	static Transparency = 0x2000;
}

const RenderMode = {
	mode:	U8,
	x: bin.If(s => ver(s, VER.R2004) > 0, {
		use_default_lights: 	B,
		default_lighting_type: 	U8,
		brightness: 			BD,
		contrast: 				BD,
		ambient: 				CMC
	})
};

const UserCoords = {
	origin:	BD3,
	xdir:	BD3,
	ydir:	BD3,
	elevation: minVer(VER.R2000, BD),
	ortho_view_type: minVer(VER.R2000, BS)
};

// DimStyle spec (faithful, flat spec object with bin.If for in-place versioning)
export const DimStyle = {
	// R13/R14 only block
	flags_pre2000: bin.If(s => ver(s, VER.R14) <= 0, {
		flags: Bits(11),
		DIMALTD: 		BS,
		DIMZIN: 		BS,
		DIMSD1_flags: 	Bits(2), // get_bits(2) * DIMSD1
		DIMTOLJ: 		BS,
		DIMJUST: 		BS,
		DIMFIT: 		BS,
		DIMUPT_flag: 	B, // get_bits(1) * DIMUPT
		DIMTZIN: 		BS,
		DIMALTZ: 		BS,
		DIMALTTZ: 		BS,
		DIMTAD: 		BS,
		DIMUNIT: 		U8,
		DIMAUNIT: 		BS,
		DIMDEC: 		BS,
		DIMTDEC: 		BS,
		DIMALTU: 		BS,
		DIMALTTD: 		BS
	}),

	// Always present fields (order as in Java)
	DIMPOST: 	TV,
	DIMAPOST: 	TV,
	DIMSCALE: 	BD,
	DIMASZ: 	BD,
	DIMEXO: 	BD,
	DIMDLI: 	BD,
	DIMEXE: 	BD,
	DIMRND: 	BD,
	DIMDLE: 	BD,
	DIMTP: 		BD,
	DIMTM: 		BD,

	// R2007+ block
	R2007plus: bin.If(s => ver(s, VER.R2007) >= 0, {
		DIMFXL: 		BD,
		DIMJOGANG: 		BD,
		DIMTFILL: 		BS,
		DIMTFILLCLR: 	U8
	}),

	// R2000+ block
	R2000plus: bin.If(s => ver(s, VER.R2000) >= 0, {
		flags: 			Bits(6), // get_bits(6)
		DIMTAD: 		BS,
		DIMZIN: 		BS,
		DIMAZIN: 		BS
	}),

	// R2007+ field
	DIMARCSYM: minVer(VER.R2007, BS),

	// Always present
	DIMTXT: 	BD,
	DIMCEN: 	BD,
	DIMTSZ: 	BD,
	DIMALTF: 	BD,
	DIMLFAC: 	BD,
	DIMTVP: 	BD,
	DIMTFAC: 	BD,
	DIMGAP: 	BD,

	// R13/R14 only block (again, as in Java)
	block2_pre2000: bin.If(s => ver(s, VER.R14) <= 0, {
		DIMPOST: 	TV,
		DIMAPOST: 	TV,
		DIMBLK: 	TV,
		DIMBLK1: 	TV,
		DIMBLK2: 	TV
	}),

	// R2000+ block (else)
	block2_2000plus: bin.If(s => ver(s, VER.R14) > 0, {
		DIMALTRND: 		BD,
		DIMALT_flag: 	B, // with_flag(DIMALT)
		DIMALTD: 		BS,
		DIMTOFL_flags: 	Bits(4) // get_bits(4) * DIMTOFL
	}),

	// Always present
	DIMCLRD: U8,
	DIMCLRE: U8,
	DIMCLRT: U8,

	// R2000+ block (continued)
	block3_2000plus: bin.If(s => ver(s, VER.R2000) >= 0, {
		DIMADEC: 		BS,
		DIMDEC: 		BS,
		DIMTDEC: 		BS,
		DIMALTU: 		BS,
		DIMALTTD: 		BS,
		DIMAUNIT: 		BS,
		DIMFRAC: 		BS,
		DIMLUNIT: 		BS,
		DIMDSEP: 		BS,
		DIMTMOVE: 		BS,
		DIMJUST: 		BS,
		DIMSD1_flags: 	Bits(2), // get_bits(2) * DIMSD1
		DIMTOLJ: 		BS,
		DIMTZIN: 		BS,
		DIMALTZ: 		BS,
		DIMALTTZ: 		BS,
		DIMUPT_flag: 	B, // with_flag(DIMUPT)
		DIMFIT: 		BS,
		// R2007+ flag
		R2007plus_flags: bin.If(s => ver(s, VER.R2007) >= 0, {
			DIMFXLON_flag: B
		}),
		// R2010+ block
		R2010plus: bin.If(s => ver(s, VER.R2010) >= 0, {
			DIMTXTDIRECTION_flag: B,
			DIMALTMZF:	BD,
			DIMALTMZS:	TV,
			DIMMZS:		TV,
			DIMMZF:		BD
		}),
		// handles
		DIMTXSTY: 	H,
		DIMLDRBLK: 	H,
		HDIMBLK: 	H,
		HDIMBLK1: 	H,
		HDIMBLK2: 	H,
		R2007plus_handles: bin.If(s => ver(s, VER.R2007) >= 0, {
			DIMLTYPE: H,
			DIMLTEX1: H,
			DIMLTEX2: H
		}),
		DIMLWD:		BS,
		DIMLWE:		BS
	})
};

class ValueSpec extends bin.Class({
	flags:		minVer(VER.R2007, BL),
	data_type:	bin.Optional(s => (s as bit_reader).obj?.flags === undefined || s.obj.flags & 1, BL),
	unit_type:	minVer(VER.R2007, BL),
	format:		minVer(VER.R2007, TV),
}) {
	static String		= 4;
	static Date			= 8;
	static Point2D		= 16;
	static Point3D		= 32;
	static Object		= 64;
	static BufferUnk	= 128;
	static BufferRes	= 256;
	static General		= 512;

	static no_units 	= 0;
	static distance 	= 1;
	static angl			= 2;
	static area			= 4;
	static volume		= 7;
}

class Value extends bin.Extend(ValueSpec, {
	value: minVer(VER.R2007, TV)
}) {}

class ContentFormat extends bin.Class({
	PropertyOverrideFlags:	BL,
	PropertyFlags:			BL,// Contains property bit values for property Auto Scale only (0x100).
	data_type:				BL,
	unit_type:				BL,
	format:					TV,

	rotation:				BD,
	scale:					BD,
	alignment:				BL,
	color:					CMC,
	TextStyle:				H,
	TextHeight:				BD
}) {}

const DXFCODE = {
	DXF_STRING:		1000,
	DXF_INVALID:	1001,
	DXF_BRACKET:	1002,
	DXF_LAYER_REF:	1003,
	DXF_BINARY:		1004,
	DXF_ENTITY_REF:	1005,
	DXF_POINTS:		1010,
	DXF_REALS:		1040,
	DXF_SHORT:		1070,
	DXF_LONG:		1071
};

const LineWidth: Record<string, number> = {
	width00:		0,	// 0.00mm
	width01:		5,	// 0.05mm
	width02:		9,	// 0.09mm
	width03:		13,	// 0.13mm
	width04:		15,	// 0.15mm
	width05:		18,	// 0.18mm
	width06:		20,	// 0.20mm
	width07:		25,	// 0.25mm
	width08:		30,	// 0.30mm
	width09:		35,	// 0.35mm
	width10:		40,	// 0.40mm
	width11:		50,	// 0.50mm
	width12:		53,	// 0.53mm
	width13:		60,	// 0.60mm
	width14:		70,	// 0.70mm
	width15:		80,	// 0.80mm
	width16:		90,	// 0.90mm
	width17:		100,// 1.00mm
	width18:		106,// 1.06mm
	width19:		120,// 1.20mm
	width20:		140,// 1.40mm
	width21:		158,// 1.58mm
	width22:		200,// 2.00mm
	width23:		211,// 2.11mm
	widthByLayer:	-1,	// by layer
	widthByBlock:	-2,	// by block
	widthDefault:	-3,	// by default
};
type LineWidth = keyof typeof LineWidth;

function LineWidthFromDXF(i: number): LineWidth {
	if (i < 0)
		return	i == -1	? 'widthByLayer'
			:	i == -2	? 'widthByBlock'
			:	'widthDefault';

	let e0	= 'width00';
	for (const e in LineWidth) {
		if (i <= LineWidth[e])
			return i * 2 < LineWidth[e0] + LineWidth[e] ? e0 : e;
		e0 = e;
	}
	return e0;
}

function LineWidthFromDWG(i: number): LineWidth {
	return 	i > 0 && i <= 23 ? Object.keys(LineWidth)[i]
		:   i == 32 - 2 ? 'widthByBlock'
		:   i == 32 - 1 ? 'widthByLayer'
		:	'widthDefault';
}

//-----------------------------------------------------------------------------
//	base Obj and Entity
//-----------------------------------------------------------------------------

class ObjBase {
	static no_xdict		= 1 << 16;
	static xdep			= 1 << 17;
	static has_binary	= 1 << 18;
	static has_entity	= 1 << 19;

	type: any; // OBJECTTYPE
	flags			= 0;
	handle			= 0;
	parentH			= 0;
	reactors: H[]	= [];
	extended?: Map<H, any>;

	parse_head(bits: bitsin) {
		this.type = OBJECTTYPE.get(bits);
		if (bits.ver(VER.R2000) >= 0 && bits.ver(VER.R2007) <= 0)
			bits.size = U32.get(bits);

		this.handle	= H.get(bits).offset();

		let	xsize = BS.get(bits);
		if (xsize != 0) {
			this.extended = new Map<H, any>();
			do {
				this.extended.set(H.get(bits), bits.read_buffer(xsize));
				xsize = BS.get(bits);
			} while (xsize != 0);
		}
	}

	parse_handles(bits: bitsin) {
		if (bits.ver(VER.R2007) >= 0)		// skip string area
			bits.seek_bit(bits.size);

		this.parentH = H.get(bits).get_offset(this.handle);
		this.reactors = bin.readn(bits, H, this.reactors.length);

		if ((this.flags & Obj.no_xdict) == 0)//linetype in 2004 seems not have XDicObjH or NULL handle
			H.get(bits);//XDicObjH
	}

	constructor(bits: bitsin2)	{
		this.parse_head(bits);
		this.parse_handles(bits);
	}
};

export class Obj extends ObjBase {
	parse_head(bits: bitsin) {
		super.parse_head(bits);

		if (bits.ver(VER.R14) <= 0)
			bits.size = U32.get(bits);

		this.reactors = Array(BL.get(bits));

		if (bits.ver(VER.R2004) >= 0)
			this.flags |= bits.with_flag(Obj.no_xdict);

		if (bits.ver(VER.R2013) >= 0)
			this.flags |= bits.with_flag(Obj.has_binary);
	}
	parse_handles(bits: bitsin) {
		if (bits.ver(VER.R2007) >= 0)		// skip string area
			bits.seek_bit(bits.size);

		this.parentH = H.get(bits).get_offset(this.handle);
		this.reactors = bin.readn(bits, H, this.reactors.length);

		if ((this.flags & Obj.no_xdict) == 0)//linetype in 2004 seems not have XDicObjH or NULL handle
			H.get(bits);//XDicObjH
	}
};

class Entity extends Obj {
	static entmode0 		= 1 << 24;
	static entmode1 		= 1 << 25;
	static no_next_links 	= 1 << 26;
	static edge_vis_style 	= 1 << 27;
	static face_vis_style 	= 1 << 28;
	static full_vis_style 	= 1 << 29;
	static invisible 		= 1 << 30;
	static is_entity 		= 1 << 31;

	static BYLAYER 			= 0;
	static CONTINUOUS 		= 1;
	static BYBLOCK 			= 2;
	static HANDLE 			= 3;

	lWeight: LineWidth	= 'widthByLayer';
	linetypeScale	= 1.0;//: InstanceType<typeof BD> = new BD(1.0);
	color?:		ENC;
	plot_flags		= Entity.BYLAYER;
	line_flags		= Entity.BYLAYER;
	material_flags	= Entity.BYLAYER;
	shadow_flags	= Entity.BYLAYER;
	linetypeH		= 0;
	plotstyleH		= 0;
	materialH		= 0;
	shadowH			= 0;
	layerH			= 0;
	next_ent		= 0;
	prev_ent		= 0;
	graphics_data?: Uint8Array;

	parse_embedded_head(bits: bitsin) {
		this.flags |= (bits.get_bits(2) * Entity.entmode0) | Entity.is_entity;
		this.reactors = new Array(BL.get(bits));
		if (bits.ver(VER.R14) <= 0)
			this.line_flags = bits.get_bit() ? Entity.BYLAYER : Entity.HANDLE;
		if (bits.ver(VER.R2004) >= 0)
			this.flags |= bits.with_flag(Entity.no_next_links);
		if (bits.ver(VER.R2007) <= 0)
			this.flags |= Entity.no_next_links;
		else
			this.flags |= bits.with_flag(Entity.no_next_links);
		this.color = ENC.get(bits);
		this.linetypeScale = BD.get(bits);
		if (bits.ver(VER.R2000) >= 0) {
			this.line_flags = bits.get_bits(2);
			this.plot_flags = bits.get_bits(2);
		}
		if (bits.ver(VER.R2007) >= 0) {
			this.material_flags = bits.get_bits(2);
			this.shadow_flags = U8.get(bits);
		}
		if (bits.ver(VER.R2010) >= 0)
			this.flags |= bits.get_bits(3) * Entity.edge_vis_style;
		this.flags |= (BS.get(bits) & 1) * Entity.invisible;
		if (bits.ver(VER.R2000) >= 0)
			this.lWeight = LineWidthFromDWG(U8.get(bits));
	}

	parse_head(bits: bitsin) {
		super.parse_head(bits);
		if (bits.get_bit())
			this.graphics_data = bits.read_buffer(U32.get(bits));
		if (bits.ver(VER.R14) <= 0)
			bits.size = U32.get(bits);
		this.parse_embedded_head(bits);
	}

	parse_handles(bits: bitsin) {
		if (bits.ver(VER.R2007) >= 0)
			bits.seek_bit(bits.size);
		if ((this.flags & (Entity.entmode0 | Entity.entmode1)) === 0)
			this.parentH = H.get(bits).get_offset(this.handle);

		this.reactors = bin.readn(bits, H, this.reactors.length);
		if ((this.flags & Entity.no_next_links) === 0)
			H.get(bits);

		if (bits.ver(VER.R14) <= 0) {
			this.layerH = H.get(bits).offset();
			if (this.line_flags === Entity.HANDLE)
				this.linetypeH = H.get(bits).offset();
		}
		if (bits.ver(VER.R2000) <= 0) {
			if ((this.flags & Entity.no_next_links) !== 0) {
				this.next_ent = this.handle + 1;
				this.prev_ent = this.handle - 1;
			} else {
				this.prev_ent = H.get(bits).get_offset(this.handle);
				this.next_ent = H.get(bits).get_offset(this.handle);
			}
		}
		if (bits.ver(VER.R2004) >= 0) {
			// Parses Bookcolor handle (omitted)
		}
		if (bits.ver(VER.R2000) >= 0) {
			this.layerH = H.get(bits).get_offset(this.handle);
			if (this.line_flags === Entity.HANDLE)
				this.linetypeH = H.get(bits).get_offset(this.handle);
			if (bits.ver(VER.R2007) >= 0) {
				if (this.material_flags === Entity.HANDLE)
					this.materialH = H.get(bits).get_offset(this.handle);
				if (this.shadow_flags === Entity.HANDLE)
					this.shadowH = H.get(bits).get_offset(this.handle);
			}
			if (this.plot_flags === Entity.HANDLE)
				this.plotstyleH = H.get(bits).get_offset(this.handle);
		}
	}

	constructor(bits: bitsin2, embedded = false) {
		super(bits);
		if (embedded)
			this.parse_embedded_head(bits);
		else
			this.parse_head(bits);
		this.parse_handles(bits);
	}
};

function Extend<B extends new (...args: any[]) => any, T>(base: B, spec: T) {
	const specReader = spec as unknown as bin.TypeReader;
	return class extends base {
		parse_head(bits: bitsin2) {
			super.parse_head(bits);
			Object.assign(this, bin.read(bits, specReader));
		}
	} as (new(...args: ConstructorParameters<B>) => InstanceType<B> & bin.ReadType<T>);
}

//-----------------------------------------------------------------------------
//	entities
//-----------------------------------------------------------------------------

class DRW_TEXT extends Extend(Entity, {
    data_flags: 	bin.Optional(s => ver(s, VER.R2000) >= 0, BS, bin.Func(() => 0)),
    elevation: 		bin.Optional(s => (s.obj.data_flags & 1) === 0, BDV),
    insert_point: 	BD3,
	align_point: 	bin.Optional(s => ver(s, VER.R2000) >= 0,
		bin.Optional(s => (s.obj.data_flags & 2) === 0, bin.Func(s => ({
			x: 		DDadjust(s, s.obj.insert_point.x),
			y: 		DDadjust(s, s.obj.insert_point.y),
		}))),
		RD2,
	),
    ext_point: 		BD3,
    thickness: 		BT,
    oblique: 		bin.Optional(s => (s.obj.data_flags & 4) === 0, BDV),
    angle: 			bin.Optional(s => (s.obj.data_flags & 8) === 0, BDV),
    height: 		BDV,
    widthscale: 	bin.Optional(s => (s.obj.data_flags & 16) === 0, BDV),
    text: 			TV,
    textgen: 		bin.Optional(s => (s.obj.data_flags & 0x20) === 0, BS),
    alignH: 		bin.Optional(s => (s.obj.data_flags & 0x40) === 0, BS),
    alignV: 		bin.Optional(s => (s.obj.data_flags & 0x80) === 0, BS),
}) {
	styleH!: H;
	parse_handles(bits: bitsin): void {
		super.parse_handles(bits);
		this.styleH = H.get(bits);
	}
};

class DRW_MTEXT extends Extend(Entity, {
    point1:		BD3,
    ext_point:	BD3,
    point2:		BD3,
    widthscale:	BD,
    rectHeight:	minVer(VER.R2007, BD), // Reference rectangle height (BD 46)
    height:		BD,
    textgen:	BS,
    draw_dir:	BS,
    ext_ht:		BD,
    ext_wid:	BD,
    text:		TV,
    LinespacingStyle: minVer(VER.R2000, BS),
    LinespacingFactor: minVer(VER.R2000, BD),
	skip_bit: minVer(VER.R2000, bin.Discard(B)),
    // R2004+ background fill logic
    bk_flags: minVer(VER.R2004, BL),
    bk_case: minVer(VER.R2004, bin.Switch(s => s.obj.bk_flags?.v ?? 0, {
        1: {
            unknown1: BL,
            col: CMC,
            unknown2: BL,
        },
        3: {
            skip: DiscardBits(112)
        }
    })),
}) {
    styleH: H;
	constructor(bits: bitsin2, embedded = false) {
		super(bits, embedded);
		this.styleH = new H(bits);
	}
}

class DRW_ATTRIB extends DRW_TEXT {
	static invisible = 1 << 0;
	static constant = 1 << 1;
	static verification = 1 << 2;
	static preset = 1 << 3;
	static lock = 1 << 4;

	annotation!:		Uint8Array;
	annotation_app!:	H;
	annotation_short	= 0;
	mtext?:				DRW_MTEXT;
	tag!:				string;
	field_length!:		number;

	parse_head(bits: bitsin2): boolean {
		super.parse_head(bits);
		const version = bits.ver(VER.R2010) >= 0 ? U8.get(bits) : 0;
		const att_type = bits.ver(VER.R2018) >= 0 ? U8.get(bits) : 0;
		if (att_type > 1)
			this.mtext = new DRW_MTEXT(bits, true);
		this.annotation = bits.read_buffer(BS.get(bits));
		if (this.annotation.length !== 0)
			this.annotation_short = BS.get(bits);
		this.tag	= TV.get(bits);
		this.field_length = BS.get(bits);
		this.flags |= U8.get(bits);
		this.flags |= bits.with_flag(DRW_ATTRIB.lock);
		return true;
	}
}

class DRW_ATTDEF extends Extend(DRW_ATTRIB, {
	version:	U8,
	prompt:		TV,
}) {}

class DRW_SHAPE extends Extend(Entity, {
	ins_pt:			BD3,
	scale:			BD,
	rotation:		BD,
	width_factor:	BD,
	oblique_angle:	BD,
	thickness:		BD,
	style_id:		BS,
	extrusion:		BD3,
}) {
	style: H;
	constructor(bits: bitsin2) {
		super(bits);
		this.style = H.get(bits);
	}
}

class DRW_REGION extends Entity {}
class DRW_SOLID_3D extends Entity {}
class DRW_OLEFRAME extends Entity {}
class DRW_TOLERANCE extends Entity {}
class DRW_OLE2FRAME extends Entity {}
class DRW_ACAD_PROXY_ENTITY extends Entity {}
class DRW_MLEADER extends Entity {}
class DRW_BODY extends Entity {}
class DRW_MLINE extends Entity {}

// --- DRW_POINT ---
class DRW_POINT extends Extend(Entity, {
    point:		BD3,
    thickness:	BT,
    ext_point:	BEXT,
    x_axis:		BD,
}) {}

class DRW_LINE extends Extend(Entity, {
	x: bin.If(s => ver(s, VER.R14) <= 0, {
		point1:		BD3,
		point2:		BD3,
	}, bin.Func(s => {
		const zIsZero = B.get(s as bit_reader);
		const x = DDadjustN(s, 2);
		const y = DDadjustN(s, 2);
		const z = zIsZero ? [0, 0] : DDadjustN(s, 2);
		return {
			point1: { x: x[0], y: y[0], z: z[0] },
			point2: { x: x[1], y: y[1], z: z[1] },
		};
	})),
	thickness:	BT,
	ext_point:	BEXT,
}) {}

class DRW_RAY extends Extend(Entity, {
	point1: BD3,
	point2: BD3
}) {}

class DRW_XLINE extends DRW_RAY { };
class DRW_CIRCLE extends Extend(Entity, {
	centre: 	BD3,
	radius:		BD,
	thickness:	BT,
	ext_point:	BEXT,
}) {}

class DRW_ARC extends Extend(DRW_CIRCLE, {
	angle0:		BD,
	angle1:		BD
}) {}

class DRW_ELLIPSE extends Extend(Entity, {
	point1:		BD3,
	point2:		BD3,
	ext_point:	BD3,
	ratio:		BD,
	angle0:		BD,
	angle1:		BD // start/end angles in radians
}) {}

class DRW_TRACE extends Extend(Entity, {
	thickness:	BT,
	point1:		BD3,
	point2:		BD3,
	point3:		BD3,
	point4:		BD3,
	ext_point:	BEXT
}) {}

class DRW_SOLID extends DRW_TRACE {};


class DRW_FACE_3D extends Extend(Entity, {
	x: bin.If(s => ver(s, VER.R14) <= 0, {
		point1:			BD3,
		point2:			BD3,
		point3:			BD3,
		point4:			BD3,
		invisibleflag:	BS	// bit per edge
	}, bin.Func(s => {
		const has_no_flag	= B.get(s as bit_reader);
		const zIsZero 		= B.get(s as bit_reader);
		const point1		= bin.read(s, {x: BD, y: BD, z: bin.Optional(!zIsZero, BD, bin.Const(0))});
		const point2		= DDadjustRecord(s, point1);
		const point3		= DDadjustRecord(s, point1);
		const point4		= DDadjustRecord(s, point1);
		return {
			point1, point2, point3, point4,
			invisibleflag:	has_no_flag ? undefined : BS.get(s as bit_reader),
		};
	}))
}) {}

class DRW_BLOCK extends Extend(Entity, {
	name:	TV
}) {}

class DRW_ENDBLK extends Extend(Entity, {
	bit:	minVer(VER.R2007, B)
}) {}

class DRW_SEQEND extends Entity {}

export class DRW_INSERT extends Extend(Entity, {
	base_point:		BD3,
	scale:			BSCALE,
	angle:			BD,
	ext_point:		BD3,
	num_handles:	BL,//bin.Optional(s => B.get(s as bit_reader) && ver(s, VER.R2004) >= 0, BL), 
}) {
	block!:		H;
	handles!:	HandleRange;
	constructor(bits: bitsin2) {
		super(bits);
		this.block		= H.get(bits);
		this.handles	= new HandleRange(bits, this.num_handles ?? 0);
	}
}
	
class DRW_MINSERT extends Extend(DRW_INSERT, {
	colcount: BS,
	rowcount: BS,
	colspace: BD,
	rowspace: BD,
}) {}

const DRW_LWPOLYLINE_flags = {
	has_ext:	1 << 0,
	has_thick:	1 << 1,
	has_width:	1 << 2,
	has_elev:	1 << 3,
	has_bulges:	1 << 4,
	has_widths:	1 << 5,
	plinegen:	1 << 7,
	open:		1 << 9,
	has_ids:	1 << 10,
};

interface PolyLineVertex {
	x: number, y: number, width0: number, width1: number, bulge: number, id: number
}

class DRW_LWPOLYLINE extends Extend(Entity, {
	flags:		BS,		// polyline flags, code 70
	width:		bin.Optional(s => (s.obj.flags & DRW_LWPOLYLINE_flags.has_width) != 0,	BD),		// constant width, code 43
	elevation:	bin.Optional(s => (s.obj.flags & DRW_LWPOLYLINE_flags.has_elev) != 0, 	BD),		// elevation, code 38
	thickness:	bin.Optional(s => (s.obj.flags & DRW_LWPOLYLINE_flags.has_thick) != 0,	BD),		// thickness, code 39
	ext_point:	bin.Optional(s => (s.obj.flags & DRW_LWPOLYLINE_flags.has_ext) != 0,	BEXT),		// Dir extrusion normal vector, code 210, 220 & 230
	vertlist:	bin.Func(s0 => {
		const s = s0 as bit_reader;
		const vertexnum		= BL.get(s);
		const bulge_count	= s.obj.flags & DRW_LWPOLYLINE_flags.has_bulges ? BL.get(s) : 0;
		const id_count		= s.obj.flags & DRW_LWPOLYLINE_flags.has_ids	? BL.get(s) : 0;
		const widths_count	= s.obj.flags & DRW_LWPOLYLINE_flags.has_widths	? BL.get(s) : 0;

		const v = Array<PolyLineVertex>(vertexnum);

		let px = 0, py = 0;
		for (let i = 0; i < vertexnum; i++) {
			if (i === 0 || s.ver(VER.R14) <= 0) {
				px = F64.get(s);
				py = F64.get(s);
			} else {
				px = DDadjust(s, px);
				py = DDadjust(s, py);
			}
			v[i].x = px;
			v[i].y = py;
		}

		// add bulges
		for (let i = 0; i < bulge_count; i++) {
			const bulge = BD.get(s);
			if (i < vertexnum)
				v[i].bulge = bulge;
		}
		// add vertexId
		for (let i = 0; i < id_count; i++) {
			const id = BL.get(s);
			if (i < vertexnum)
				v[i].id = id;
		}
		// add widths
		for (let i = 0; i < widths_count; i++) {
			const w0 = BD.get(s), w1 = BD.get(s);
			if (i < vertexnum) {
				v[i].width0 = w0;
				v[i].width1 = w1;
			}
		}
		return v;
	})
}) {}

class DRW_VERTEX_PFACE_FACE extends Extend(Entity, {
	index: bin.ArrayType(4, BS)
}) {}

class DRW_VERTEX_2D extends Extend(Entity, {
	flags:	U8,
	point:	BD3,
	width0: BD,
	width1: bin.Optional(s => s.obj.width0 >= 0, BD, bin.Func(s => {
		if (s.obj.width0 < 0)
			s.obj.width1 = s.obj.width0 = -s.obj.width0;
	})),
	bulge: BD,
	id:		minVer(VER.R2010, BL),
	tgdir:	BD,
}) {}

class Vertex extends Extend(Entity, {
	flags:	U8,
	point:	BD3
}) {}

class DRW_VERTEX_3D extends Vertex { };
class DRW_VERTEX_MESH extends Vertex { };
class DRW_VERTEX_PFACE extends Vertex { };

class Polyline extends Entity {
	handles!: HandleRange;
	vertices: any[] = [];
	parse_handles(bits: bitsin) {
		const count = bits.ver(VER.R2004) >= 0 ? BL.get(bits) : 1;
		super.parse_handles(bits);
		this.handles = new HandleRange(bits, count);
	}
	children(): any { return this.handles.collection(this.handle); }
};

class DRW_POLYLINE_2D extends Extend(Polyline, {
	tflags:			BS,
	curve_type:		BS,
	width0:			BD,
	width1:			BD,
	thickness:		BT,
	elevation:		BD,
	ext_point:		BEXT,
}) {}

class DRW_POLYLINE_3D extends Extend(Polyline, {
	flags:			U16,
	curve_type:		BS,
}) {}

class DRW_POLYLINE_PFACE extends Extend(Polyline, {
	vertexcount:	BS,
	facecount:		BS
}) {
}

class DRW_POLYLINE_MESH extends Extend(Polyline, {
	curve_type:		BS,
	num_m_verts:	BS,
	num_n_verts:	BS,
	m_density:		BS,
	n_density:		BS
}) {}


class DRW_SPLINE extends Extend(Entity, {
	scenario: BL,
	x: bin.If(s => ver(s, VER.R2013) >= 0 && ((s as bitsin).get_bits(1) & 1) !== 0, {
		// scenario 2 fields
		fit_tol: 	BD,
		tangent0:	BD3,
		tangent1:	BD3,
		nfit:		BL,
		fitlist:	bin.ArrayType(s => s.obj.nfit, BD3)
	}, bin.If(s => s.obj.scenario === 1, {
		// scenario 1 fields
		flags:		Bits(3),
		knot_tol:	BD,
		control_tol: BD,
		nknots:		BL,
		ncontrol:	BL,
		weight:		B,
		knotslist:		bin.ArrayType(s => s.obj.nknots, BD),
		controllist:	bin.ArrayType(s => s.obj.ncontrol, BD3),
		weightlist:		bin.Optional(s => s.obj.weight,
			bin.ArrayType(s => s.obj.ncontrol, BD)
		)
	}))
}) {}

const Line = {
	point1: RD2, point2: RD2
};

const CircleArc = {
	centre:	RD2,
	radius:	BD, angle0: BD, angle1: BD,
	isccw:	B
};

const EllipseArc = {
	point1: RD2,
	point2: RD2,
	ratio:	BD, param0: BD, param1: BD,
	isccw:	B
};

const Spline = {
	degree:		BL,
	isRational: B, periodic: B,
	nknots:		BL, ncontrol: BL,
	knotslist: bin.ArrayType(s => s.obj.nknots, F64),
	controllist: bin.If(s => s.obj.isRational, bin.ArrayType(s => s.obj.ncontrol, RD3), bin.ArrayType(s => s.obj.ncontrol, RD2)),
	x: bin.If(s => ver(s, VER.R2010) >= 0, {
		fitlist:	bin.ArrayType(BL, RD2),
		tangent0:	RD2,
		tangent1:	RD2,
	})
};

const HatchLoop = {
	type:	BL,
	x: bin.If(s => s.obj.type & 2, {
		objlist: bin.ArrayType(BL, bin.Switch(U8, {
			1:	Line,
			2:	CircleArc,
			3:	EllipseArc,
			4:	Spline,
		}))}, {
			has_bulge:	B,
			closed:		B,
			objlist: bin.ArrayType(BL,	{
				point:	RD2,
				bulge:	bin.Optional(s => s.obj.has_bulge, BD),
			})
		}
	),
	bound:	BL,
};

const HatchLine = {
	angle:	BD,
	point:	BD2,
	offset:	BD2,
	dash:	bin.ArrayType(BS, BD),
};

const Gradient = {
	isGradient:	BL,
	res:		BL,
	gradAngle:	BD,
	gradShift:	BD,
	singleCol:	BL,
	gradTint:	BD,
	entries: 	bin.ArrayType(BL, {
		unkDouble:	BD,
		unkShort:	BS,
		rgbCol:		BL,
		ignCol:		U8
	})
};

class DRW_HATCH extends Extend(Entity, {
	associative: B,
	solid:		B,
	x: bin.If(s => ver(s, VER.R2004) >= 0, {
		grad:		Gradient,
		grad_name:	TV,
	}),
	elevation:	BD,
	ext_point:	BD3,
	name:		TV,

	loops:		bin.ArrayType(BL, HatchLoop),
	hstyle:		BS,			// hatch style, code 75
	hpattern:	BS,			// hatch pattern type, code 76
	y: bin.If(s => ver(s, VER.R2004) >= 0, {
		angle:		BD,		// hatch pattern angle, code 52
		scale:		BD,		// hatch pattern scale, code 41
		use_double:	B,
		deflines:	bin.ArrayType(BS, HatchLine),
	}),
	pixsize:	bin.Optional(s => s.obj.loops.some((i: bin.ReadType<typeof HatchLoop>) => i.type & 4), BD),
	seeds:		bin.ArrayType(BL, RD2),
}) {
	bound:		H[];

	constructor(bits: bitsin2) {
		super(bits);
		this.bound = bin.readn(bits, H, 42);//this.loops.reduce((a, b) => a + b.bound, 0));
	}
};

class DRW_IMAGE extends Extend(Entity, {
	point1:		BD3,
	point2:		BD3,
	v_vector:	BD3,
	size:		BD2,
	clip:		B,
	brightness: BD,
	contrast:	BD,
	fade: 		BD,
	clip_mode:	minVer(VER.R2010, B),
	clip_data:	bin.Switch(BS, {
		1: {a: F64, b: F64},
		0: bin.ArrayType(BL, F64)
	})
}) {
	static clip_mode = 1 << 0;
	ref:	H;
	constructor(bits: bitsin2) {
		super(bits);
		this.ref = H.get(bits);
		H.get(bits);
	}
}

class Dimension extends Extend(Entity, {
	class_version:		minVer(VER.R2010, U8),
	extrusion:			BD3,
	text_midpt:			RD2,
	elevation:			BD,
	tflags:				U8,
	user_text:			TV,
	text_rotation:		BD,
	horiz_dir:			BD,
	ins_scale:			BD3,
	ins_rotation:		BD,
	attachment:			minVer(VER.R2000, BS),
	lspace_style:		minVer(VER.R2000, BS),
	lspace_factor:		minVer(VER.R2000, BD),
	act_measurement:	minVer(VER.R2000, BD),
	clone_ins_pt:		RD2,
	styleH:				H,
	blockH:				H
}) {
	static readonly non_default = 1 << 0;
	static readonly use_block = 1 << 1;
	static readonly flip_arrow1 = 1 << 2;
	static readonly flip_arrow2 = 1 << 3;
	static readonly has_arrow2 = 1 << 4;
	static readonly unknown = 1 << 6;
}

class DRW_DIMENSION_ORDINATE extends Extend(Dimension, {
	defpoint:	BD3,
	def1:		BD3,
	def2:		BD3
}) {}

class DRW_DIMENSION_LINEAR extends Extend(Dimension, {
	defpoint:	BD3,
	def1:		BD3,
	def2:		BD3,
	oblique:	BD,
	angle:		BD
}) {}

class DRW_DIMENSION_ALIGNED extends Extend(Dimension, {
	defpoint:	BD3,
	def1: 		BD3,
	def2:		BD3,
	oblique:	BD
}) {}

export class DRW_DIMENSION_ANG_LN2 extends Extend(Dimension, {
	arcPoint:	RD2,
	def1:		BD3,
	def2:		BD3,
	centrePoint:BD3,
	defpoint:	BD3
}) {}

class DRW_DIMENSION_ANG_PT3 extends Extend(Dimension, {
	defpoint:	BD3,
	def1:		BD3,
	def2:		BD3,
	centrePoint:BD3
}) {}

class DRW_DIMENSION_RADIUS extends Extend(Dimension, {
	defpoint:	BD3,
	circlePoint:BD3,
	radius:		BD
}) {}

class DRW_DIMENSION_DIAMETER extends Extend(Dimension, {
	circlePoint:BD3,
	defpoint:	BD3,
	radius:		BD
}) {}

class DRW_LEADER extends Extend(Entity, {
	annot_type: 	BS,
	path_type: 		BS,
	vertexlist: 	bin.ArrayType(BL, BD3),
	endptproj: 		BD3,
	extrusionPoint: BEXT,
	fivebits: 		minVer(VER.R2000, Bits(5)),
	horizdir: 		BD3,
	offsetblock: 	BD3,
	extra_bd3: 		bin.Optional(s => ver(s, VER.R14) >= 0, BD3),
	dimgap: 		maxVer(VER.R14, BD),
	textsize: 		maxVer(VER.R2007, BD2),
	flagbits: 		Bits(2),
	arrow_head: 	maxVer(VER.R14, BS),
	dimasz: 		maxVer(VER.R14, BD),
	nunkbits: 		maxVer(VER.R14, Bits(2)),
	unk_short: 		maxVer(VER.R14, BS),
	byBlock_color: 	maxVer(VER.R14, BS),
	else_bs: 		bin.Optional(s => ver(s, VER.R14) > 0, BS),
	lastbits: 		Bits(2),
	AnnotH: 		H,
	styleH: 		H
}) {}

export class DRW_VIEWPORT extends Extend(Entity, {
	point:	BD3,
	pssize:	BD2,
	x1: bin.If(s => ver(s, VER.R2000) >= 0, {
		view_target: 	BD3,
		view_dir: 		BD3,
		twist_angle: 	BD,
		view_height: 	BD,
		view_length: 	BD,
		front_clip: 	BD,
		back_clip: 		BD,
		snap_angle: 	BD,
		centerP: 		RD2,
		snapP: 			RD2,
		snapSpP: 		RD2,
	}),
	grid_major: minVer(VER.R2007, BS),
	x2: bin.If(s => ver(s, VER.R2000) >= 0, {
		frozen:			bin.ArrayType(BL, H),
		status_flags:	BL,
		style_sheet:	TV,
		_render_mode:	U8,
		flags:			Bits(2),
		ucs:			UserCoords,
	}),
	render_mode: minVer(VER.R2004, RenderMode),
	vport_entity_header: maxVer(VER.R14, H),
	x3: bin.If(s => ver(s, VER.R2000) >= 0, {
		clip_boundary:	H,
		named_ucs:		H,
		base_ucs:		H,
	}),
	x4: bin.If(s => ver(s, VER.R2007) >= 0, {
		background:		H,
		visualstyle:	H,
		shadeplot:		H,
		sun:			H,
	})
}) {}

//-----------------------------------------------------------------------------
// Objects
//-----------------------------------------------------------------------------

export class ObjControl extends Obj {
	handles!: number[];

	get_handles(bits: bitsin, n: number) {
		return bin.readn(bits, H, n).map(h => h.get_offset(this.handle));
	}

	parse_handles(bits: bitsin) {
		const n = BL.get(bits);
		super.parse_handles(bits);
		this.handles = this.get_handles(bits, n);
	}
};

class DRW_BLOCK_CONTROL_OBJ	extends ObjControl {
	parse_handles(bits: bitsin) {
		const n = BL.get(bits) + 2;
		super.parse_handles(bits);
		this.handles = this.get_handles(bits, n);
	}
};

class DRW_LTYPE_CONTROL_OBJ extends ObjControl {
	parse_handles(bits: bitsin) {
		const n = BL.get(bits) + 2;
		super.parse_handles(bits);
		this.handles = this.get_handles(bits, n);
	}
};

class DRW_DIMSTYLE_CONTROL_OBJ extends ObjControl {
	handles2!: number[];
	parse_handles(bits: bitsin) {
		const	n = BL.get(bits);
		// V2000 dimstyle seems have one unknown byte hard handle counter??
		const	n2 = bits.ver(VER.R2000) >= 0 ? U8.get(bits) : 0;

		super.parse_handles(bits);
		this.handles	= this.get_handles(bits, n);
		this.handles2	= this.get_handles(bits, n2);
	}
};

class DRW_LAYER_CONTROL_OBJ		extends ObjControl {};
class DRW_STYLE_CONTROL_OBJ		extends ObjControl {};
class DRW_VIEW_CONTROL_OBJ		extends ObjControl {};
class DRW_UCS_CONTROL_OBJ		extends ObjControl {};
class DRW_VPORT_CONTROL_OBJ		extends ObjControl {};
class DRW_APPID_CONTROL_OBJ		extends ObjControl {};
class DRW_VP_ENT_HDR_CTRL_OBJ	extends ObjControl {};

class DRW_DICTIONARY extends ObjControl {
	static readonly cloning = 1 << 0;
	name:	string;

	constructor(bits: bitsin2) {
		super(bits);
		if (bits.ver(VER.R14) <= 0) {
			U8.get(bits);
		} else {
			this.flags |= bits.with_flag(DRW_DICTIONARY.cloning);
			U8.get(bits);// hardowner
		}
		this.name = TV.get(bits);
	}
};

class DRW_DICTIONARYWDFLT extends DRW_DICTIONARY {
	def!: H;

	parse_handles(bits: bitsin2): boolean {
		super.parse_handles(bits);
		this.def = H.get(bits);
		return true;
	}
};

class DRW_ACDBDICTIONARYWDFLT extends DRW_DICTIONARYWDFLT {
}
class NamedObject extends Extend(Obj, {
	name: 		TV,
	has_entity:	B,
	xrefindex:	maxVer(VER.R2004, BS),
	xdep:		B,
}) {}

class DRW_BLOCK_HEADER extends Extend(NamedObject, {
	flags: BS,
	insUnits: minVer(VER.R2007, BS),
	scaling: minVer(VER.R2007, U8),
	base_point: BD3,
	xref_path: TV,
	description: minVer(VER.R2000, TV),
	preview: minVer(VER.R2000, bin.Buffer(BL)),
	block: H,
	entities: HandleRange.read(s => s.obj.objcount),
	inserts: minVer(VER.R2000, bin.ArrayType(s => {
		let count = 0, i;
		while ((i = U8.get(s)) !== 0)
			count += i;
		return count;
	}, H)),
	layoutH: minVer(VER.R2000, H)
}) {}

class DRW_LAYER extends Extend(NamedObject, {
	x: bin.If(s => ver(s, VER.R14) <= 0, {
		frozen: 	B,
		unused: 	B,
		frozen2: 	B,
		locked: 	B,
	}, {
		flags:		BS,
		//lWeight: LineWidth,
	}),
	color: CMC,
	plotstyleH: minVer(VER.R2000, H),
	materialstyleH: minVer(VER.R2007, H),
	linetypeH: H
}) {}

// DRW_STYLE
class DRW_STYLE extends Extend(NamedObject, {
	flags:		BS,
	height:		BD,
	width:		BD,
	oblique:	BD,
	genFlag:	U8,
	lastHeight:	BD,
	font:		TV,
	bigFont:	TV
}) {}

// DRW_LTYPE
class DRW_LTYPE extends Extend(NamedObject, {
	desc:	TV,
	align:	U8,
	length: BD,
	path: bin.ArrayType(U8, {
		hash_length:BD,
		code:		BS,
		x_offset:	F64,
		y_offset:	F64,
		scale:		BD,
		rotation:	BD,
		flags:		BS
	}),
	strarea:	maxVer(VER.R2004, bin.Buffer(256)),
	strarea2:	bin.Optional(s => ver(s, VER.R2004) > 0, bin.Buffer(512)),
	dashH:		bin.Optional(s => U8.get(s) > 0, H),
	shapeH: H
}) {}

// DRW_VIEW
class DRW_VIEW extends Extend(NamedObject, {
	height:			BD,
	width:			BD,
	center:			BD2,
	view_target:	BD3,
	view_dir:		BD3,
	twist_angle:	BD,
	LensLength:		BD,
	front_clip:		BD,
	back_clip:		BD,
	ViewMode:		Bits(4),
	render_mode:	minVer(VER.R2000, RenderMode),
	ucs:			minVer(VER.R2000, bin.Optional(B, UserCoords)),
	BackgroundH:	minVer(VER.R2007, H),
	VisualStyleH:	minVer(VER.R2007, H),
	SunH:			minVer(VER.R2007, H),
	BaseUCSH:		minVer(VER.R2000, H),
	NamedUCSH:		minVer(VER.R2000, H),
	LiveSectionH:	minVer(VER.R2007, H)
}) {}

// DRW_UCS
class DRW_UCS extends Extend(NamedObject, {
	ucs:		UserCoords,
	ortho_type: minVer(VER.R2000, BS)
}) {}

// DRW_VPORT
class DRW_VPORT extends Extend(NamedObject, {
	lower_left:		BD2,
	upper_right:	BD2,
	center:			BD2,
	snap_base:		BD2,
	snap_spacing:	BD2,
	grid_spacing:	BD2,
	view_dir:		BD3,
	view_target:	BD3,
	height:			BD,
	ratio:			BD,
	lensHeight:		BD,
	front_clip:		BD,
	back_clip:		BD,
	snap_angle:		BD,
	twist_angle:	BD,
	view_mode:		Bits(4),
	circleZoom:		BS,
	snap_isopair:	BS,
	gridBehavior:	minVer(VER.R2007, BS),
	grid_major:		minVer(VER.R2007, BS),
	render_mode:	minVer(VER.R2000, RenderMode),
	ucs:			minVer(VER.R2000, UserCoords),
	bkgrdH:			minVer(VER.R2007, H),
	visualStH:		minVer(VER.R2007, H),
	sunH:			minVer(VER.R2007, H),
	namedUCSH:		minVer(VER.R2000, H),
	baseUCSH:		minVer(VER.R2000, H)
}) {}

// DRW_APPID
class DRW_APPID extends Extend(NamedObject, {
	unknown:		bin.Optional(s => true, U8)
}) {}

// DRW_DIMSTYLE
class DRW_DIMSTYLE extends Extend(NamedObject, {
	dim:			DimStyle
}) {}

// DRW_VP_ENT_HDR
class DRW_VP_ENT_HDR extends NamedObject {}

// DRW_LAYOUT
class DRW_LAYOUT extends NamedObject {}

// DRW_IMAGEDEF
class DRW_IMAGEDEF extends Extend(NamedObject, {
	name:			TV,
	version:		BL,
	imageSize:		BD2,
	pixelSize:		BD2,
	loaded:			B,
	resolution:		U8
}) {}

// DRW_GROUP
class DRW_GROUP extends Extend(NamedObject, {
	name:		TV,
	handles:	bin.ArrayType(BL, H),
	flags:		Bits(2)
}) {}


// DRW_DICTIONARYVAR
class DRW_DICTIONARYVAR extends Extend(Obj, {
	name:	TV,
	value:	U8
}) {}

// DRW_MLINESTYLE
class DRW_MLINESTYLE extends Extend(Obj, {
	name:		TV,
	desc:		TV,
	mlineflags:	BS,
	fillcolor:	CMC,
	angle0:		BD,
	angle1:		BD,
	items: bin.ArrayType(U8, {
		offset: 	BD,
		color:		CMC,
		lineindex:	BS,
		linetype:	bin.Optional(s => ver(s, VER.R2018) < 0, H),
	})
}) {
	constructor(bits: bitsin2) {
		super(bits);
		if (ver(bits, VER.R2018) >= 0) {
			for (const i of this.items)
				i.linetype = H.get(bits);
		}
	}
}

// DRW_FIELD
class DRW_FIELD extends Extend(Obj, {
	EvaluatorID:		TV,
	FieldCode:			TV,
	num_children:		BL,
	num_objects:		BL,
	FormatString:		maxVer(VER.R2004, TV),
	EvaluationFlags:	BL,
	FilingFlags:		BL,
	StateFlags:			BL,
	EvalStatusFlags:	BL,
	EvalErrorCode:		BL,
	EvaluationError:	TV,
	value:				Value,
	ValueString:		TV,
	ValueStringLength:	TV,
	child_fields:		bin.ArrayType(BL, {k: TV, v: Value}),
}) {
	children:	H[];
	objects:	H[];
	constructor(bits: bitsin2) {
		super(bits);
		this.children	= bin.readn(bits, H, this.num_children);
		this.objects	= bin.readn(bits, H, this.num_objects);
	}
}


// DRW_PLOTSETTINGS
class DRW_PLOTSETTINGS extends Extend(Obj, {
	name:				TV,
	marginLeft:			BD,
	marginBottom:		BD,
	marginRight:		BD,
	marginTop:			BD
}) {}

// DRW_TABLESTYLE

const RowStyle = {
	text_style:			H,
	text_height:		BD,
	text_align:			BS,
	text_colour:		CMC,
	fill_colour:		CMC,
	bk_color_enabled:	B
};

const CellStyle = {
	style_type:			BL,
	x: bin.If(BS, {
		PropertyOverrideFlags:	BL,
		MergeFlags:				BL,
		BackgroundColor:		CMC,
		ContentLayoutFlags:		BL,
		ContentFormat:			ContentFormat,
		x:bin.If(BS, {
			VerticalMargin:			BD,
			HorizontalMargin:		BD,
			BottomMargin:			BD,
			RightMargin:			BD,
			MarginHorizontalSpacing:BD,
			MarginVerticalSpacing:	BD,
		}),
		borders:	bin.ArrayType(BL, H),
		id:			BL,
	}),
	type:	BL,
	name:	TV
};

class DRW_TABLESTYLE extends Extend(Obj, {
	name: TV,
	flow_dir: maxVer(VER.R2007, BS),
	style_flags: maxVer(VER.R2007, BS),
	hmargin: maxVer(VER.R2007, BD),
	vmargin: maxVer(VER.R2007, BD),
	data: maxVer(VER.R2007, RowStyle),
	title: maxVer(VER.R2007, RowStyle),
	header: maxVer(VER.R2007, RowStyle),
	cellstyle: minVer(VER.R2010, CellStyle),
	cellstyles: minVer(VER.R2010, bin.ArrayType(BL, CellStyle))
}) {}

// DRW_IDBUFFER
class DRW_IDBUFFER extends Extend(Obj, {
	unknown: 		U8,
	num_obj_ids:	BL
}) {}

// AcDbObjectContextData
const AcDbObjectContextData = {
	class_version:	BS,
	is_default:		B
};

// AcDbAnnotScaleObjectContextData
const AcDbAnnotScaleObjectContextData = {
	...AcDbObjectContextData,
	scale: H
};

// AcDbTextObjectContextData
const AcDbTextObjectContextData = {
	horizontal_mode: BS,
	rotation: BD,
	ins_pt: BD2,
	alignment_pt: BD2
};

// AcDbDimensionObjectContextData
const AcDbDimensionObjectContextData = {
	flags: BL,
	def_pt: BD2,
	text_rotation: BD,
	block: H,
	override_code: U8
};

// DRW_ACDB_MTEXTATTRIBUTEOBJECTCONTEXTDATA_CLASS
class DRW_ACDB_MTEXTATTRIBUTEOBJECTCONTEXTDATA_CLASS extends Extend(Obj, {
	scale_obj: AcDbAnnotScaleObjectContextData,
	text_obj: AcDbTextObjectContextData
}) {}

// DRW_ACDB_BLKREFOBJECTCONTEXTDATA_CLASS
class DRW_ACDB_BLKREFOBJECTCONTEXTDATA_CLASS extends Extend(Obj, {
	scale_obj: AcDbAnnotScaleObjectContextData,
	rotation: BD,
	ins_pt: BD3,
	scale_factor: BD3
}) {}

class DRW_LONG_TRANSACTION extends Obj {}
class DRW_ACDBPLACEHOLDER extends Obj {}
class DRW_VBA_PROJECT extends Obj {}
class DRW_ACAD_PROXY_OBJECT extends Obj {}
class DRW_XRECORD extends Obj {}
class DRW_ACAD_TABLE extends Obj {}
class DRW_CELLSTYLEMAP extends Obj {}
class DRW_DBCOLOR extends Obj {}
class DRW_IMAGEDEFREACTOR extends Obj {}
class DRW_LAYER_INDEX extends Obj {}
class DRW_LWPLINE extends Obj {}
class DRW_MATERIAL extends Obj {}
class DRW_MLEADERSTYLE extends Obj {}
class DRW_PLACEHOLDER extends Obj {}
class DRW_RASTERVARIABLES extends Obj {}
class DRW_SCALE extends Obj {}
class DRW_SORTENTSTABLE extends Obj {}
class DRW_SPATIAL_FILTER extends Obj {}
class DRW_SPATIAL_INDEX extends Obj {}
class DRW_TABLEGEOMETRY extends Obj {}
class DRW_TABLESTYLES extends Obj {}
class DRW_VISUALSTYLE extends Obj {}
class DRW_WIPEOUTVARIABLE extends Obj {}
class DRW_EXACXREFPANELOBJECT extends Obj {}
class DRW_NPOCOLLECTION extends Obj {}
class DRW_ACDBSECTIONVIEWSTYLE extends Obj {}
class DRW_ACDBDETAILVIEWSTYLE extends Obj {}

export type OBJECTTYPE = {index: number} & (new(bits: bitsin2)=>Obj);
function O(index: number, clss: new(bits: bitsin2)=>Obj) {
	return Object.assign({index}, clss);
}

const OBJECTTYPES: Record<string, OBJECTTYPE> = {
//	UNUSED: 				{index: 0x00} as OBJECTTYPE,
	TEXT:					O(0x01, DRW_TEXT),
	ATTRIB: 				O(0x02, DRW_ATTRIB),
	ATTDEF:					O(0x03, DRW_ATTDEF),				//	E
	BLOCK:					O(0x04, DRW_BLOCK),					//	E
	ENDBLK:					O(0x05, DRW_ENDBLK),				//	E
	SEQEND:					O(0x06, DRW_SEQEND),				//	E
	INSERT:					O(0x07, DRW_INSERT),				//	E
	MINSERT:				O(0x08, DRW_MINSERT),				//	E
	VERTEX_2D:				O(0x0A, DRW_VERTEX_2D),				//	E
	VERTEX_3D:				O(0x0B, DRW_VERTEX_3D),				//	E
	VERTEX_MESH:			O(0x0C, DRW_VERTEX_MESH),			//	E
	VERTEX_PFACE:			O(0x0D, DRW_VERTEX_PFACE),			//	E
	VERTEX_PFACE_FACE:		O(0x0E, DRW_VERTEX_PFACE_FACE),		//	E
	POLYLINE_2D:			O(0x0F, DRW_POLYLINE_2D),			//	E
	POLYLINE_3D:			O(0x10, DRW_POLYLINE_3D),			//	E
	ARC:					O(0x11, DRW_ARC),					//	E
	CIRCLE:					O(0x12, DRW_CIRCLE),				//	E
	LINE:					O(0x13, DRW_LINE),					//	E
	DIMENSION_ORDINATE:		O(0x14, DRW_DIMENSION_ORDINATE),	//	E
	DIMENSION_LINEAR:		O(0x15, DRW_DIMENSION_LINEAR),		//	E
	DIMENSION_ALIGNED:		O(0x16, DRW_DIMENSION_ALIGNED),		//	E
	DIMENSION_ANG_PT3:		O(0x17, DRW_DIMENSION_ANG_PT3),		//	E
	DIMENSION_ANG_LN2:		O(0x18, DRW_DIMENSION_ANG_LN2),		//	E
	DIMENSION_RADIUS:		O(0x19, DRW_DIMENSION_RADIUS),		//	E
	DIMENSION_DIAMETER:		O(0x1A, DRW_DIMENSION_DIAMETER),	//	E
	POINT:					O(0x1B, DRW_POINT),					//	E
	FACE_3D:				O(0x1C, DRW_FACE_3D),				//	E
	POLYLINE_PFACE:			O(0x1D, DRW_POLYLINE_PFACE),		//	E
	POLYLINE_MESH:			O(0x1E, DRW_POLYLINE_MESH),			//	e
	SOLID:					O(0x1F, DRW_SOLID),					//	E
	TRACE:					O(0x20, DRW_TRACE),					//	E
	SHAPE:					O(0x21, DRW_SHAPE),					//	e
	VIEWPORT:				O(0x22, DRW_VIEWPORT),				//	E
	ELLIPSE:				O(0x23, DRW_ELLIPSE),				//	E
	SPLINE:					O(0x24, DRW_SPLINE),				//	E
	REGION:					O(0x25, DRW_REGION),				//	e
	SOLID_3D:				O(0x26, DRW_SOLID_3D),				//	e
	BODY:					O(0x27, DRW_BODY),					//	e
	RAY:					O(0x28, DRW_RAY),					//	E
	XLINE:					O(0x29, DRW_XLINE),					//	E
	DICTIONARY:				O(0x2A, DRW_DICTIONARY),			//	O
	OLEFRAME:				O(0x2B, DRW_OLEFRAME),				//	e
	MTEXT:					O(0x2C, DRW_MTEXT),					//	E
	LEADER:					O(0x2D, DRW_LEADER),				//	E
	TOLERANCE:				O(0x2E, DRW_TOLERANCE),				//	e
	MLINE:					O(0x2F, DRW_MLINE),					//	E
	BLOCK_CONTROL_OBJ:		O(0x30, DRW_BLOCK_CONTROL_OBJ),
	BLOCK_HEADER:			O(0x31, DRW_BLOCK_HEADER),
	LAYER_CONTROL_OBJ:		O(0x32, DRW_LAYER_CONTROL_OBJ),
	LAYER:					O(0x33, DRW_LAYER as any),
	STYLE_CONTROL_OBJ:		O(0x34, DRW_STYLE_CONTROL_OBJ),
	STYLE:					O(0x35, DRW_STYLE),
	LTYPE_CONTROL_OBJ:		O(0x38, DRW_LTYPE_CONTROL_OBJ),
	LTYPE:					O(0x39, DRW_LTYPE),
	VIEW_CONTROL_OBJ:		O(0x3C, DRW_VIEW_CONTROL_OBJ),
	VIEW:					O(0x3D, DRW_VIEW),
	UCS_CONTROL_OBJ:		O(0x3E, DRW_UCS_CONTROL_OBJ),
	UCS:					O(0x3F, DRW_UCS),
	VPORT_CONTROL_OBJ:		O(0x40, DRW_VPORT_CONTROL_OBJ),
	VPORT:					O(0x41, DRW_VPORT),
	APPID_CONTROL_OBJ:		O(0x42, DRW_APPID_CONTROL_OBJ),
	APPID:					O(0x43, DRW_APPID),
	DIMSTYLE_CONTROL_OBJ:	O(0x44, DRW_DIMSTYLE_CONTROL_OBJ),
	DIMSTYLE:				O(0x45, DRW_DIMSTYLE),
	VP_ENT_HDR_CTRL_OBJ:	O(0x46, DRW_VP_ENT_HDR_CTRL_OBJ),
	VP_ENT_HDR:				O(0x47, DRW_VP_ENT_HDR),
	GROUP:					O(0x48, DRW_GROUP),					//	O
	MLINESTYLE:				O(0x49, DRW_MLINESTYLE),			//	O
	OLE2FRAME:				O(0x4A, DRW_OLE2FRAME),				//	e
	LONG_TRANSACTION:		O(0x4C, DRW_LONG_TRANSACTION),		//
	LWPOLYLINE:				O(0x4D, DRW_LWPOLYLINE),			//	E
	HATCH:					O(0x4E, DRW_HATCH as any),			//	E
	XRECORD:				O(0x4F, DRW_XRECORD),				//	o
	ACDBPLACEHOLDER:		O(0x50, DRW_ACDBPLACEHOLDER),		//	o	aka PLACEHOLDER
	VBA_PROJECT:			O(0x51, DRW_VBA_PROJECT),			//	o
	LAYOUT:					O(0x52, DRW_LAYOUT),				//	o
	IMAGE:					O(0x65, DRW_IMAGE),					//	E
	IMAGEDEF:				O(0x66, DRW_IMAGEDEF),				//	O
	ACAD_PROXY_ENTITY:		O(0x1f2, DRW_ACAD_PROXY_ENTITY),	//	e
	ACAD_PROXY_OBJECT:		O(0x1f3, DRW_ACAD_PROXY_OBJECT),	//	o
	_LOOKUP:				{index: 0x1f4} as OBJECTTYPE,		//

	// non-fixed types:
	ACAD_TABLE:				O(0x8000, DRW_ACAD_TABLE),
	CELLSTYLEMAP:								O(0x8000, DRW_CELLSTYLEMAP),
	DBCOLOR:									O(0x8000, DRW_DBCOLOR),
	DICTIONARYVAR:								O(0x8000, DRW_DICTIONARYVAR),		//	O
	DICTIONARYWDFLT:							O(0x8000, DRW_DICTIONARYWDFLT),		//	O
	FIELD:										O(0x8000, DRW_FIELD),				//	O
	IDBUFFER:									O(0x8000, DRW_IDBUFFER),			//	o
	IMAGEDEFREACTOR:							O(0x8000, DRW_IMAGEDEFREACTOR),		//	o
	LAYER_INDEX:								O(0x8000, DRW_LAYER_INDEX),			//	o
	LWPLINE:									O(0x8000, DRW_LWPLINE),
	MATERIAL:									O(0x8000, DRW_MATERIAL),			//	o
	MLEADER:									O(0x8000, DRW_MLEADER),				//	e
	MLEADERSTYLE:								O(0x8000, DRW_MLEADERSTYLE),		//	o
	PLACEHOLDER:								O(0x8000, DRW_PLACEHOLDER),
	PLOTSETTINGS:								O(0x8000, DRW_PLOTSETTINGS),		//	O
	RASTERVARIABLES:							O(0x8000, DRW_RASTERVARIABLES),		//	o
	SCALE:										O(0x8000, DRW_SCALE),
	SORTENTSTABLE:								O(0x8000, DRW_SORTENTSTABLE),		//	o
	SPATIAL_FILTER:								O(0x8000, DRW_SPATIAL_FILTER),		//	o
	SPATIAL_INDEX:								O(0x8000, DRW_SPATIAL_INDEX),		//	o
	TABLEGEOMETRY:								O(0x8000, DRW_TABLEGEOMETRY),
	TABLESTYLES:								O(0x8000, DRW_TABLESTYLES),
	VISUALSTYLE:								O(0x8000, DRW_VISUALSTYLE),			//	o
	WIPEOUTVARIABLE:							O(0x8000, DRW_WIPEOUTVARIABLE),
	ACDBDICTIONARYWDFLT:						O(0x8000, DRW_ACDBDICTIONARYWDFLT),	//	o	aka DICTIONARYWDFLT
	TABLESTYLE:									O(0x8000, DRW_TABLESTYLE),			//	o
	EXACXREFPANELOBJECT:						O(0x8000, DRW_EXACXREFPANELOBJECT),
	NPOCOLLECTION:								O(0x8000, DRW_NPOCOLLECTION),
	ACDBSECTIONVIEWSTYLE:						O(0x8000, DRW_ACDBSECTIONVIEWSTYLE),
	ACDBDETAILVIEWSTYLE:						O(0x8000, DRW_ACDBDETAILVIEWSTYLE),
	ACDB_BLKREFOBJECTCONTEXTDATA_CLASS:			O(0x8000, DRW_ACDB_BLKREFOBJECTCONTEXTDATA_CLASS),
	ACDB_MTEXTATTRIBUTEOBJECTCONTEXTDATA_CLASS:	O(0x8000, DRW_ACDB_MTEXTATTRIBUTEOBJECTCONTEXTDATA_CLASS),
};


export const OBJECTTYPE = Object.assign(OBJECTTYPES, {
	FromInt(id: number) {
		for (const e of Object.values(OBJECTTYPES)) {
			if (e.index == id)
				return e;
		}
	},

	FromName(name: string) {
		return OBJECTTYPES[name];
	},

	get(s: bit_reader) {
		if (s.ver(VER.R2007) < 0) {
			return this.FromInt(U16.get(s));
		} else {
			switch (s.get_bits(2)) {
				case 0:
					return this.FromInt(U8.get(s));
				case 1:
					return this.FromInt(U8.get(s) + 0x1f0);
				default:
					return this.FromInt(U16.get(s));
			}
		}
	}
});


export class UCSstuff extends bin.Class({
	INSBASE: 	BD3,
	EXTMIN: 	BD3,
	EXTMAX: 	BD3,
	LIMMIN: 	RD2,
	LIMMAX: 	RD2,
	ELEVATION: 	BD,
	ORG: 		BD3,
	XDIR: 		BD3,
	YDIR: 		BD3,
	NAME: 		H,
	x: bin.If(s => ver(s, VER.R2000) >= 0, {
		ORTHOREF: 	H,
		ORTHOVIEW: 	BS,
		BASE: 		H,
		ORGTOP: 	BD3,
		ORGBOTTOM: 	BD3,
		ORGLEFT: 	BD3,
		ORGRIGHT: 	BD3,
		ORGFRONT: 	BD3,
		ORGBACK: 	BD3
	})
}) {}

export class TIME extends bin.Class({
	day:		BL,
	msec:		BL
}) {}

export class HeaderVars extends bin.Class({
	requiredVersions: minVer(VER.R2013, bin.ArrayType(BL, BL)),
	_unk1:		[BD, BD, BD, BD, TV, TV, TV, TV, BL, BL] as const,
	_unk11:		maxVer(VER.R14, BS),
	_unk12:		maxVer(VER.R2000, H),
	DIMASO:		B,
	DIMSHO:		B,
	DIMSAV:		maxVer(VER.R14, B),
	PLINEGEN:	B,
	ORTHOMODE:	B,
	REGENMODE:	B,
	FILLMODE:	B,
	QTEXTMODE:	B,
	PSLTSCALE:	B,
	LIMCHECK:	B,
	BLIPMODE:	B,
	USRTIMER:	B,
	SKPOLY:		B,
	ANGDIR:		B,
	SPLFRAME:	B,
	ATTREQ_ATTDIA: bin.If(s => ver(s, VER.R14) <= 0, {
		ATTREQ: B,
		ATTDIA: B,
	}),
	MIRRTEXT:		B,
	WORLDVIEW:		B,
	WIREFRAME:		maxVer(VER.R14, B),
	TILEMODE:		B,
	PLIMCHECK:		B,
	VISRETAIN:		B,
	DELOBJ:			maxVer(VER.R14, B),
	DISPSILH:		B,
	PELLIPSE:		B,
	PROXIGRAPHICS:	BS,
	DRAGMODE:		maxVer(VER.R14, BS),
	TREEDEPTH:		BS,
	LUNITS:			BS,
	LUPREC:			BS,
	AUNITS:			BS,
	AUPREC:			BS,
	OSMODE:			maxVer(VER.R14, BS),
	ATTMODE:		BS,
	COORDS:			maxVer(VER.R14, BS),
	PDMODE:			BS,
	PICKSTYLE:		maxVer(VER.R14, BS),
	_unk13_15:		minVer(VER.R2004, [BL, BL, BL] as const),
	USERI1:			BS,
	USERI2:			BS,
	USERI3:			BS,
	USERI4:			BS,
	USERI5:			BS,
	SPLINESEGS:		BS,
	SURFU:			BS,
	SURFV:			BS,
	SURFTYPE:		BS,
	SURFTAB1:		BS,
	SURFTAB2:		BS,
	SPLINETYPE:		BS,
	SHADEDGE:		BS,
	SHADEDIF:		BS,
	UNITMODE:		BS,
	MAXACTVP:		BS,
	ISOLINES:		BS,
	CMLJUST:		BS,
	TEXTQLTY:		BS,
	LTSCALE:		BD,
	TEXTSIZE:		BD,
	TRACEWID:		BD,
	SKETCHINC:		BD,
	FILLETRAD:		BD,
	THICKNESS:		BD,
	ANGBASE:		BD,
	PDSIZE:			BD,
	PLINEWID:		BD,
	USERR1:			BD,
	USERR2:			BD,
	USERR3:			BD,
	USERR4:			BD,
	USERR5:			BD,
	CHAMFERA:		BD,
	CHAMFERB:		BD,
	CHAMFERC:		BD,
	CHAMFERD:		BD,
	FACETRES:		BD,
	CMLSCALE:		BD,
	CELTSCALE:		BD,
	MENU:			TV,
	TDCREATE:		TIME,
	TDUPDATE:		TIME,
	// R2004+ block
	_unk16_18:		minVer(VER.R2004, [BL, BL, BL] as const),
	TDINDWG:			TIME,
	TDUSRTIMER:			TIME,//ok
	CECOLOR:			CMC,
	HANDSEED:			H,	//bad
	CLAYER:				H,
	TEXTSTYLE:			H,
	CELTYPE:			H,
	CMATERIAL:			minVer(VER.R2007, H),
	DIMSTYLE:			H,
	CMLSTYLE:			H,
	PSVPSCALE:			minVer(VER.R2000, BD),
	PUCS:				UCSstuff,
	UCS:				UCSstuff,
	dim:				DimStyle,
	BLOCK_CONTROL:		H,
	LAYER_CONTROL:		H,
	TEXTSTYLE_CONTROL:	H,
	LINETYPE_CONTROL:	H,
	VIEW_CONTROL:		H,
	UCS_CONTROL:		H,
	VPORT_CONTROL:		H,
	APPID_CONTROL:		H,
	DIMSTYLE_CONTROL:	H,
	VP_ENT_HDR_CONTROL:	maxVer(VER.R2000, H),
	GROUP_CONTROL:		H,
	MLINESTYLE_CONTROL:	H,
	// R2000+ block
	DICT_BLOCK: bin.If(s => ver(s, VER.R2000) >= 0, {
		DICT_NAMED_OBJS:		H,
		TSTACKALIGN:			BS,
		TSTACKSIZE:				BS,
		HYPERLINKBASE:			TV,
		STYLESHEET:				TV,
		LAYOUTS_CONTROL:		H,
		PLOTSETTINGS_CONTROL:	H,
		DICT_PLOTSTYLES:		H,
		// R2004+ block
		DICT_MATERIALS_COLORS: bin.If(s => ver(s, VER.R2004) >= 0, {
			DICT_MATERIALS: 	H,
			DICT_COLORS:		H,
		}),
		// R2007+ block
		DICT_VISUALSTYLE:	bin.If(s => ver(s, VER.R2007) >= 0, {
			DICT_VISUALSTYLE:	H,
		}),
		// R2013+ block
		DICT_UNKNOWN:		bin.If(s => ver(s, VER.R2013) >= 0, {
			DICT_UNKNOWN: H,
		}),
		_unk19:				BL,
		INSUNITS:			BS,
		CEPSNTYPE:			BS,
		CPSNID:				bin.Optional(s => s.obj.CEPSNTYPE === 3, H),
		FINGERPRINTGUID:	TV,
		VERSIONGUID:		TV,
		// R2004+ block
		SORTENTS_BLOCK: bin.If(s => ver(s, VER.R2004) >= 0, {
			SORTENTS:			U8,
			INDEXCTL:			U8,
			HIDETEXT:			U8,
			XCLIPFRAME:			U8,
			DIMASSOC:			U8,
			HALOGAP:			U8,
			OBSCUREDCOLOR:		BS,
			INTERSECTIONCOLOR:	BS,
			OBSCUREDLTYPE:		U8,
			INTERSECTIONDISPLAY:U8,
			PROJECTNAME:		TV,
		}),
	}),
	BLOCK_PAPER_SPACE:	H,
	BLOCK_MODEL_SPACE:	H,
	LTYPE_BYLAYER:		H,
	LTYPE_BYBLOCK:		H,
	LTYPE_CONTINUOUS:	H,
	// R2007+ block
	CAMERA_BLOCK: bin.If(s => ver(s, VER.R2007) >= 0, {
		CAMERADISPLAY:		B,
		_unk20:				[BL, BL, BD] as const,
		STEPSPERSEC:		BD,
		STEPSIZE:			BD,
		_3DDWFPREC:			BD,
		LENSLENGTH:			BD,
		CAMERAHEIGHT:		BD,
		SOLIDHIST:			U8,
		SHOWHIST:			U8,
		PSOLWIDTH:			BD,
		PSOLHEIGHT:			BD,
		LOFTANG1:			BD,
		LOFTANG2:			BD,
		LOFTMAG1:			BD,
		LOFTMAG2:			BD,
		LOFTPARAM:			BS,
		LOFTNORMALS:		U8,
		LATITUDE:			BD,
		LONGITUDE:			BD,
		NORTHDIRECTION:		BD,
		TIMEZONE:			BL,
		LIGHTGLYPHDISPLAY:	U8,
		TILEMODELIGHTSYNCH:	U8,
		DWFFRAME:			U8,
		DGNFRAME:			U8,
		_unk23:				B,
		INTERFERECOLOR:		CMC,
		INTERFEREOBJVS:		H,
		INTERFEREVPVS:		H,
		DRAGVS:				H,
		CSHADOW:			U8,
		_unk24:				BD,
	}),
	// R14+ block
	UNK25_28: minVer(VER.R14, [BS,BS,BS,BS] as const),
}) {}

export class MoveableClass extends bin.Class({
	flags:			BS,
	appName:		TV,
	cName:			TV,
	dxfName:		TV,
	wasazombie:		B,
	type:			BS,
	count:			BL,
	version:		BS,
	maintenance:	BS,
	unknown1:		BL,
	unknown2:		BL,
}) {
	static erase_allowed					= 1 << 0;
	static transform_allowed				= 1 << 1;
	static color_change_allowed				= 1 << 2;
	static layer_change_allowed				= 1 << 3;
	static line_type_change_allowed			= 1 << 4;
	static line_type_scale_change_allowed	= 1 << 5;
	static visibility_change_allowed		= 1 << 6;
	static cloning_allowed					= 1 << 7;
	static lineweight_change_allowed		= 1 << 8;
	static plot_Style_Name_change_allowed	= 1 << 9;
	static disable_proxy_warning_dialog		= 1 << 10;
	static is_R13_format_proxy				= 1 << 15;
	static wasazombie						= 1 << 16;
	static makes_entities					= 1 << 17;
};


export const MC = {
	get(s: bin.stream) {
		let r = 0;
		for (let i = 0; i < 64; i += 7) {
			const c = bin.UINT8.get(s);
			r |= (c & 0x7f) << i;
			if ((c & 0x80) === 0)
				break;
		}
		return r;
	}
};

export const MCS = {
	get(s: bin.stream) {
		let r = 0;
		for (let i = 0; i < 64; i += 7) {
			const c = bin.UINT8.get(s);
			r |= (c & 0x7f) << i;
			if ((c & 0x80) === 0) {
				if ((c & 0x40) !== 0)
					r = ((0x40 << i) - r);
				break;
			}
		}
		return r;
	}
};

function get_string_offset(bits: bitsin) {
	let		offset	= 0;
	const	bsize	= bits.size;
	if (bits.ver(VER.R2007) >= 0) {
		const tell = bits.tell_bit();
		bits.seek_bit(bsize - 1);
		if (bits.get_bit()) {
			bits.seek_bit(bsize - 17);
			let	ssize	= U16.get(bits);
			if ((ssize & 0x8000) != 0) {
				bits.seek_bit(bsize - 33);
				ssize = ((ssize & 0x7fff) + (U16.get(bits) << 15)) + 16;
			}
			offset = bsize - ssize - 17;
		}
		bits.seek_bit(tell);
	}
	return offset;
}

export async function get_object(file: ASyncReader, loc: number, version: VER) {
	const r = new bin.stream(await file.read_buffer(BigInt(loc), 16));
	let size = U16.get(r);
	if ((size & 0x8000) !== 0)
		size += (U16.get(r) << 15) - 0x8000;

	const bsize		= version >= VER.R2010 ? size * 8 - MC.get(r) : size * 8;
	const offset	= r.tell();
	const data		= await file.read_buffer(BigInt(loc), size + offset + 2);

	const crc16		= new CRC16(0xc0c1);
	crc16.updateBuffer(data);
	if (crc16.getValue() !== 0)
		return undefined;

	const	bits	= new bitsin(new Uint8Array(data.buffer, offset, data.length - 2), version, bsize);
	const	soffset	= get_string_offset(bits);
	return soffset !== 0 ? new bitsin2(bits, bits.dup(), soffset) : new bitsin2(bits);
}

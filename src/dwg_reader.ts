import * as bin from '@isopodlabs/binary';
import fs from 'fs/promises';

class CRC16 {
	static table: number[] = [
		0x0000, 0xC0C1, 0xC181, 0x0140, 0xC301, 0x03C0, 0x0280, 0xC241,
		0xC601, 0x06C0, 0x0780, 0xC741, 0x0500, 0xC5C1, 0xC481, 0x0440,
		0xCC01, 0x0CC0, 0x0D80, 0xCD41, 0x0F00, 0xCFC1, 0xCE81, 0x0E40,
		0x0A00, 0xCAC1, 0xCB81, 0x0B40, 0xC901, 0x09C0, 0x0880, 0xC841,
		0xD801, 0x18C0, 0x1980, 0xD941, 0x1B00, 0xDBC1, 0xDA81, 0x1A40,
		0x1E00, 0xDEC1, 0xDF81, 0x1F40, 0xDD01, 0x1DC0, 0x1C80, 0xDC41,
		0x1400, 0xD4C1, 0xD581, 0x1540, 0xD701, 0x17C0, 0x1680, 0xD641,
		0xD201, 0x12C0, 0x1380, 0xD341, 0x1100, 0xD1C1, 0xD081, 0x1040,
		0xF001, 0x30C0, 0x3180, 0xF141, 0x3300, 0xF3C1, 0xF281, 0x3240,
		0x3600, 0xF6C1, 0xF781, 0x3740, 0xF501, 0x35C0, 0x3480, 0xF441,
		0x3C00, 0xFCC1, 0xFD81, 0x3D40, 0xFF01, 0x3FC0, 0x3E80, 0xFE41,
		0xFA01, 0x3AC0, 0x3B80, 0xFB41, 0x3900, 0xF9C1, 0xF881, 0x3840,
		0x2800, 0xE8C1, 0xE981, 0x2940, 0xEB01, 0x2BC0, 0x2A80, 0xEA41,
		0xEE01, 0x2EC0, 0x2F80, 0xEF41, 0x2D00, 0xEDC1, 0xEC81, 0x2C40,
		0xE401, 0x24C0, 0x2580, 0xE541, 0x2700, 0xE7C1, 0xE681, 0x2640,
		0x2200, 0xE2C1, 0xE381, 0x2340, 0xE101, 0x21C0, 0x2080, 0xE041,
		0xA001, 0x60C0, 0x6180, 0xA141, 0x6300, 0xA3C1, 0xA281, 0x6240,
		0x6600, 0xA6C1, 0xA781, 0x6740, 0xA501, 0x65C0, 0x6480, 0xA441,
		0x6C00, 0xACC1, 0xAD81, 0x6D40, 0xAF01, 0x6FC0, 0x6E80, 0xAE41,
		0xAA01, 0x6AC0, 0x6B80, 0xAB41, 0x6900, 0xA9C1, 0xA881, 0x6840,
		0x7800, 0xB8C1, 0xB981, 0x7940, 0xBB01, 0x7BC0, 0x7A80, 0xBA41,
		0xBE01, 0x7EC0, 0x7F80, 0xBF41, 0x7D00, 0xBDC1, 0xBC81, 0x7C40,
		0xB401, 0x74C0, 0x7580, 0xB541, 0x7700, 0xB7C1, 0xB681, 0x7640,
		0x7200, 0xB2C1, 0xB381, 0x7340, 0xB101, 0x71C0, 0x7080, 0xB041,
		0x5000, 0x90C1, 0x9181, 0x5140, 0x9301, 0x53C0, 0x5280, 0x9241,
		0x9601, 0x56C0, 0x5780, 0x9741, 0x5500, 0x95C1, 0x9481, 0x5440,
		0x9C01, 0x5CC0, 0x5D80, 0x9D41, 0x5F00, 0x9FC1, 0x9E81, 0x5E40,
		0x5A00, 0x9AC1, 0x9B81, 0x5B40, 0x9901, 0x59C0, 0x5880, 0x9841,
		0x8801, 0x48C0, 0x4980, 0x8941, 0x4B00, 0x8BC1, 0x8A81, 0x4A40,
		0x4E00, 0x8EC1, 0x8F81, 0x4F40, 0x8D01, 0x4DC0, 0x4C80, 0x8C41,
		0x4400, 0x84C1, 0x8581, 0x4540, 0x8701, 0x47C0, 0x4680, 0x8641,
		0x8201, 0x42C0, 0x4380, 0x8341, 0x4100, 0x81C1, 0x8081, 0x4040,
	];

	constructor(public crc = 0) {}
	reset() {
		this.crc = 0;
	}
	getValue(): number {
		return this.crc;
	}
	update(b: number) {
		this.crc = (this.crc >>> 8) ^ CRC16.table[(this.crc ^ b) & 0xff];
	}
	updateBuffer(b: Uint8Array | number[], off: number, len: number) {
		for (let i = off, e = i + len; i !== e; ++i)
			this.update(b[i]);
	}
}

const VER = {
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

	FromInt(id: number) {
		for (const e of Object.values(VER)) {
			if (typeof e === 'number' && e === id)
				return e;
		}
		return VER.BAD;
	}
} as const;

type VER	= number;//keyof typeof VER;

type reader = bin._stream;

interface bit_reader extends reader {
	ver(v: VER):	number;
	get_bit():		boolean;
	get_bits(n: number): number;
	tell_bit():		number;
	seek_bit(offset: number): void;

	seek_cur_bit(offset: number): void;
	with_flag(value: number): number;
	read_buffer_to(dest: ArrayBuffer, offset: number, count: number) : number;
}

function ver(s: reader, v: VER) {
	return (s as bit_reader).ver(v);
}
function minVer<T extends bin.Type, F extends bin.Type | undefined = undefined>(v: VER, type: T, false_type?: F)
	: bin.TypeT<F extends bin.Type ? bin.ReadType<T | F> : bin.ReadType<T> | undefined> {
	return bin.Optional(s => ver(s, v) >= 0, type, false_type);
}
function maxVer<T extends bin.Type, F extends bin.Type | undefined = undefined>(v: VER, type: T, false_type?: F)
	: bin.TypeT<F extends bin.Type ? bin.ReadType<T | F> : bin.ReadType<T> | undefined> {
	return bin.Optional(s => ver(s, v) <= 0, type, false_type);
}

// -----------------------------------------------------------------------------
// bit_reader implementations
// -----------------------------------------------------------------------------

class memory_bits_reader {
	b:		Uint8Array;
	p:		number;
	bit:	number;

	constructor(x: memory_bits_reader | Uint8Array) {
		if (x instanceof memory_bits_reader) {
			this.b = x.b;
			this.p = x.p;
			this.bit = x.bit;
		} else {
			this.b = x;
			this.p = 0;
			this.bit = 0;
		}
	}
	remaining(): number {
		return this.b.length - this.p - (this.bit > 0 ? 1 : 0);
	}
	tell(): number {
		return this.p + (this.bit > 0 ? 1 : 0);
	}
	seek(offset: number): void {
		this.p = Math.min(offset, this.b.length);
		this.bit = 0;
	}
	tell_bit(): number {
		return this.p * 8 + this.bit;
	}
	seek_bit(offset: number): void {
		this.p = Math.min(Math.floor(offset / 8), this.b.length);
		this.bit = offset & 7;
	}
	seek_cur_bit(offset: number): void {
		this.seek_bit(this.tell_bit() + offset);
	}
/*	getc(): number {
		if (this.remaining() === 0)
			return -1;
		++this.p;
		if (this.bit === 0)
			return (this.b[this.p - 1] + 256) & 255;
		else
			return ((((this.b[this.p - 1] & 0xff) << 8) | (this.b[this.p] & 0xff)) >> (8 - this.bit)) & 0xff;
	}*/
	get_bit(): boolean {
		const ret = ((this.b[this.p] >> (7 - this.bit)) & 1) !== 0;
		this.bit = (this.bit + 1) & 7;
		if (this.bit === 0)
			++this.p;
		return ret;
	}
	get_bits(n: number): number {
		this.bit += n;
		let ret: number;
		if (this.bit <= 8)
			ret = (this.b[this.p] >> (8 - this.bit));
		else
			ret = (this.b[this.p] << (this.bit - 8)) | ((this.b[this.p + 1] & 0xff) >> (16 - this.bit));
		this.p += this.bit >> 3;
		this.bit &= 7;
		return ret & ((1 << n) - 1);
	}
	skip(offset: number) {
		this.seek(this.p + offset);
		return this;
	}
	align(align: number) {
		const offset = this.tell() % align;
		if (offset)
			this.skip(align - offset);
	}
	read_buffer(len: number) {
		const offset = this.p;
		this.seek(offset + len);
		return new Uint8Array(this.b.buffer, offset, this.p - offset);
	}
	write_buffer(v: Uint8Array) {
	}
	read_buffer_to(dest: ArrayBuffer, offset: number, len: number) {
		const b = this.read_buffer(len);
		len = b.length;
		const destView = new Uint8Array(dest);
		for (let i = 0; i < len; i++)
			destView[offset + i] = b[i];
		return len;
	}

	remainder() {
		return new Uint8Array(this.b.buffer, this.p);
	}
	view<T>(view: bin.View<T>, len: number) {
		if (this.p + len > this.b.length)
			throw new Error('stream: out of bounds');
		const v = new view(this.b.buffer, this.p, len);
		this.p += len;
		return v;
	}
	with_flag(value: number) {
		return this.get_bit() ? value : 0;
	}
}

class bitsin extends memory_bits_reader implements bit_reader {
	ver_: VER;
	size	= 0;

	constructor(b: Uint8Array, v: VER);
	constructor(b: bitsin);
	constructor(b: any, v?: VER) {
		if (b instanceof bitsin) {
			super(b);
			this.ver_ = b.ver_;
			this.size = b.size;
		} else {
			super(b);
			this.ver_ = v!;
		}
	}
	ver(v: VER): number {
		return this.ver_ - v;
	}
}

class bitsin2 extends bitsin {
	sbits: bitsin;
	soffset = 0;

	constructor(bits: bitsin);
	constructor(bits: bitsin, _sbits: bitsin, _soffset: number);
	constructor(bits: bitsin, _sbits?: bitsin, _soffset?: number) {
		super(bits);
		if (_sbits !== undefined && _soffset !== undefined) {
			this.sbits = _sbits;
			this.soffset = _soffset;
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

class bitsin3 extends bitsin2 {
	hbits: bitsin;
	constructor(bits: bitsin2);
	constructor(bits: bitsin2, _hbits: bitsin);
	constructor(bits: bitsin2, _hbits?: bitsin) {
		super(bits);
		if (_hbits !== undefined)
			this.hbits = _hbits;
		else
			this.hbits = bits;
	}
}

const B = {
	get(inb: bit_reader) {
		return inb.get_bit();
	},
	put(outb: reader) {}
};
function Bits(n: number) {
	return {
		get(s: bit_reader) {
			return s.get_bits(n);
		},
		put(s: reader) {
		}
	};
};
function DiscardBits(n: number) {
	return {
		get(s: bit_reader) {
			return s.seek_cur_bit(n);
		},
		put(s: reader) {
		}
	};
};


const R8 = bin.UINT8;
const R16 = bin.UINT16;
const R32 = bin.UINT32;
const R64 = bin.UINT64;
const F64 = bin.Float64;

const RD = bin.Float64;
const RD2 = {x: RD, y: RD};
const RD3 = {x: RD, y: RD, z: RD};

const BD = {
	get(r: reader): number {
		const inb = r as bit_reader;
		switch (inb.get_bits(2)) {
			case 0: return bin.Float64.get(inb);
			case 1: return 1;
			default:
			case 2: return 0;
		}
	},
	put(r: reader, v: any) {}
};

const BD2 = {x: BD, y: BD};
//const BD3 = {x: BD, y: BD, z: BD};
class BD3 extends bin.Class({x: BD, y: BD, z: BD}) {}

const BDV = {
	get(bits: bit_reader): number {
		return bits.ver(VER.R2000) >= 0 ? bin.Float64.get(bits) : BD.get(bits);
	},
	put(bits: bit_reader) {}
};

// BitExtrusion
const BEXT = {
	get(inb: bit_reader) {
		return inb.ver(VER.R2000) >= 0 && inb.get_bit() ? {x: 0, y: 0, z: 0} : bin.read(inb, BD3);
	},
	put(outb: reader) {}
};

// BitDouble With Default
function DDadjust(s: reader, v: number): number {
	const inb		= s as bit_reader;
	const buffer	= new ArrayBuffer(8);
	const view		= new DataView(buffer);
	view.setFloat64(0, v, true);
	switch (inb.get_bits(2)) {
		case 0:
			break;
		case 1:
			inb.read_buffer_to(buffer, 0, 4);
			break;
		case 2:
			// Read 2 + 4 bytes
			inb.read_buffer_to(buffer, 4, 2);
			inb.read_buffer_to(buffer, 0, 4);
			break;
		case 3:
			// Read 8 bytes
			inb.read_buffer_to(buffer, 0, 8);
			break;
	}
	return view.getFloat64(0, true);
}

function DDadjustN(s: reader, n: number): number[] {
	const inb = s as bit_reader;
	const out = Array<number>(n);
	out[0] = RD.get(inb);
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
				x = RD.get(bits);
			// fallthrough
			case 1: {
				const y = DDadjust(bits, x);
				const z = DDadjust(bits, x);
				return {x, y, z};
			}
			case 2:
				x = RD.get(bits);
				return {x, y: x, z: x};
			case 3:
				return {x: 0, y: 0, z: 0};
		}
	}
};
const BT = {
	get(inb: bit_reader) {
		return inb.ver(VER.R2000) >= 0 && inb.get_bit() ? 0 : bin.read(inb, BD);
	},
	put(outb: reader) {}
};

const BS = {
	get(inb: bit_reader) {
		switch (inb.get_bits(2)) {
			default:
			case 0: return R16.get(inb);
			case 1: return R8.get(inb);
			case 2: return 0;
			case 3: return 256;
		}
	},
	put(outb: reader) {}
};
const BSV = {
	get(inb: bit_reader) {
		return inb.ver(VER.R2000) < 0 ? R8.get(inb) : bin.read(inb, BS);
	}
};
const BL = {
	get(inb: bit_reader) {
		switch (inb.get_bits(2)) {
			case 0: return R32.get(inb);
			case 1: return R8.get(inb);
			default:
			case 2: return 0;
		}
	},
	put(s: reader, v: any) {}
};
const BLL = {
	get(inb: bit_reader) {
		const n = inb.get_bits(3);
		let v = 0;
		for (let i = 0; i < n; i++)
			v = (v << 8) | R8.get(inb);
		return v;
	}
};
const MC = {
	get(inb: reader) {
		let r = 0;
		for (let i = 0; i < 64; i += 7) {
			const c = R8.get(inb);
			r |= (c & 0x7f) << i;
			if ((c & 0x80) === 0)
				break;
		}
		return r;
	}
};
const MCS = {
	get(inb: reader) {
		let r = 0;
		for (let i = 0; i < 64; i += 7) {
			const c = R8.get(inb);
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

class H extends bin.Class({
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

const TV = bin.StringType(BS, 'utf8');

class CMC extends bin.Class({
	index:		BS,
	rgb:		minVer(VER.R2000, BL),
	name:		minVer(VER.R2000, bin.Optional(R8, TV))
}) {
	static ByLayer = 0xC0;
	static ByBlock = 0xC1;
	static RGB = 0xC2;
	static ACIS = 0xC3;
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

const TIME = {
	day:		BL,
	msec:		BL
};

const RenderMode = {
	mode:	R8,
	x: bin.If(s => ver(s, VER.R2004) > 0, {
		use_default_lights: 	B,
		default_lighting_type: 	R8,
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

const GradientEntry = {
	unkDouble:	BD,
	unkShort:	BS,
	rgbCol:		BL,
	ignCol:		R8
};

const Gradient = {
	isGradient:	BL,
	res:		BL,
	gradAngle:	BD,
	gradShift:	BD,
	singleCol:	BL,
	gradTint:	BD,
	entries: 	bin.ArrayType(BL, GradientEntry)
};


// DimStyle spec (faithful, flat spec object with bin.If for in-place versioning)
const DimStyle = {
	// R13/R14 only block
	flags_pre2000: bin.If(s => ver(s, VER.R14) <= 0, bin.Struct({
		flags: Bits(11),
		DIMALTD: BS,
		DIMZIN: BS,
		DIMSD1_flags: Bits(2), // get_bits(2) * DIMSD1
		DIMTOLJ: BS,
		DIMJUST: BS,
		DIMFIT: BS,
		DIMUPT_flag: B, // get_bits(1) * DIMUPT
		DIMTZIN: BS,
		DIMALTZ: BS,
		DIMALTTZ: BS,
		DIMTAD: BS,
		DIMUNIT: R8,
		DIMAUNIT: BS,
		DIMDEC: BS,
		DIMTDEC: BS,
		DIMALTU: BS,
		DIMALTTD: BS
	})),

	// Always present fields (order as in Java)
	DIMPOST: TV,
	DIMAPOST: TV,
	DIMSCALE: BD,
	DIMASZ: BD,
	DIMEXO: BD,
	DIMDLI: BD,
	DIMEXE: BD,
	DIMRND: BD,
	DIMDLE: BD,
	DIMTP: BD,
	DIMTM: BD,

	// R2007+ block
	R2007plus: bin.If(s => ver(s, VER.R2007) >= 0, {
		DIMFXL: BD,
		DIMJOGANG: BD,
		DIMTFILL: BS,
		DIMTFILLCLR: R8
	}),

	// R2000+ block
	R2000plus: bin.If(s => ver(s, VER.R2000) >= 0, {
		flags: Bits(6), // get_bits(6)
		DIMTAD: BS,
		DIMZIN: BS,
		DIMAZIN: BS
	}),

	// R2007+ field
	DIMARCSYM: bin.If(s => ver(s, VER.R2007) >= 0, BS),

	// Always present
	DIMTXT: BD,
	DIMCEN: BD,
	DIMTSZ: BD,
	DIMALTF: BD,
	DIMLFAC: BD,
	DIMTVP: BD,
	DIMTFAC: BD,
	DIMGAP: BD,

	// R13/R14 only block (again, as in Java)
	block2_pre2000: bin.If(s => ver(s, VER.R14) <= 0, {
		DIMPOST: TV,
		DIMAPOST: TV,
		DIMBLK: TV,
		DIMBLK1: TV,
		DIMBLK2: TV
	}),

	// R2000+ block (else)
	block2_2000plus: bin.If(s => ver(s, VER.R14) > 0, {
		DIMALTRND: BD,
		DIMALT_flag: B, // with_flag(DIMALT)
		DIMALTD: BS,
		DIMTOFL_flags: Bits(4) // get_bits(4) * DIMTOFL
	}),

	// Always present
	DIMCLRD: R8,
	DIMCLRE: R8,
	DIMCLRT: R8,

	// R2000+ block (continued)
	block3_2000plus: bin.If(s => ver(s, VER.R2000) >= 0, {
		DIMADEC: BS,
		DIMDEC: BS,
		DIMTDEC: BS,
		DIMALTU: BS,
		DIMALTTD: BS,
		DIMAUNIT: BS,
		DIMFRAC: BS,
		DIMLUNIT: BS,
		DIMDSEP: BS,
		DIMTMOVE: BS,
		DIMJUST: BS,
		DIMSD1_flags: Bits(2), // get_bits(2) * DIMSD1
		DIMTOLJ: BS,
		DIMTZIN: BS,
		DIMALTZ: BS,
		DIMALTTZ: BS,
		DIMUPT_flag: B, // with_flag(DIMUPT)
		DIMFIT: BS,
		// R2007+ flag
		R2007plus_flags: bin.If(s => ver(s, VER.R2007) >= 0, {
			DIMFXLON_flag: B
		}),
		// R2010+ block
		R2010plus: bin.If(s => ver(s, VER.R2010) >= 0, {
			DIMTXTDIRECTION_flag: B,
			DIMALTMZF: BD,
			DIMALTMZS: TV,
			DIMMZS: TV,
			DIMMZF: BD
		}),
		// handles
		DIMTXSTY: H,
		DIMLDRBLK: H,
		HDIMBLK: H,
		HDIMBLK1: H,
		HDIMBLK2: H,
		R2007plus_handles: bin.If(s => ver(s, VER.R2007) >= 0, {
			DIMLTYPE: H,
			DIMLTEX1: H,
			DIMLTEX2: H
		}),
		DIMLWD: BS,
		DIMLWE: BS
	})
};

class ValueSpec extends bin.Class({
	flags:		minVer(VER.R2007, BL),
	data_type:	bin.Optional(s => (s as bit_reader).obj?.flags === undefined || s.obj.flags & 1, BL),
	unit_type:	minVer(VER.R2007, BL),
	format:		minVer(VER.R2007, TV),
}) {
	static String = 4;
	static Date = 8;
	static Point2D = 16;
	static Point3D = 32;
	static Object = 64;
	static BufferUnk = 128;
	static BufferRes = 256;
	static General = 512;

	static no_units = 0;
	static distance = 1;
	static angl = 2;
	static area = 4;
	static volume = 7;
}

class Value extends bin.Extend(ValueSpec, {
	value: minVer(VER.R2007, TV)
}) {}

class ContentFormat extends bin.Class({
	PropertyOverrideFlags: BL,
	PropertyFlags: BL,// Contains property bit values for property Auto Scale only (0x100).
	data_type: BL,
	unit_type: BL,
	format: TV,

	rotation: BD,
	scale: BD,
	alignment: BL,
	color: CMC,
	TextStyle: H,
	TextHeight: BD
}) {}

const DXFCODE = {
	DXF_STRING: 1000,
	DXF_INVALID: 1001,
	DXF_BRACKET: 1002,
	DXF_LAYER_REF: 1003,
	DXF_BINARY: 1004,
	DXF_ENTITY_REF: 1005,
	DXF_POINTS: 1010,
	DXF_REALS: 1040,
	DXF_SHORT: 1070,
	DXF_LONG: 1071
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
	reactors: H[] = [];
	extended?: Map<H, any>;

	parse_head(bits: bitsin) {
		this.type = OBJECTTYPE.get(bits);
		if (bits.ver(VER.R2000) >= 0 && bits.ver(VER.R2007) <= 0)
			bits.size = R32.get(bits);

		this.handle	= H.get(bits).offset();

		let	xsize = BS.get(bits);
		if (xsize != 0) {
			this.extended = new Map<H, any>();
			do {
				const	ah = H.get(bits);
				this.extended.set(ah, bits.read_buffer(xsize));
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

class Obj extends ObjBase {
	parse_head(bits: bitsin) {
		super.parse_head(bits);

		if (bits.ver(VER.R14) <= 0)
			bits.size = R32.get(bits);

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
			this.shadow_flags = R8.get(bits);
		}
		if (bits.ver(VER.R2010) >= 0)
			this.flags |= bits.get_bits(3) * Entity.edge_vis_style;
		this.flags |= (BS.get(bits) & 1) * Entity.invisible;
		if (bits.ver(VER.R2000) >= 0)
			this.lWeight = LineWidthFromDWG(R8.get(bits));
	}

	parse_head(bits: bitsin) {
		super.parse_head(bits);
		if (bits.get_bit())
			this.graphics_data = bits.read_buffer(R32.get(bits));
		if (bits.ver(VER.R14) <= 0)
			bits.size = R32.get(bits);
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
    data_flags: bin.Optional(s => ver(s, VER.R2000) >= 0, BS, bin.Func(() => 0)),
    elevation: bin.Optional(s => (s.obj.data_flags & 1) === 0, BDV),
    insert_point: BD3,
	align_point: bin.Optional(s => ver(s, VER.R2000) >= 0,
		bin.Optional(s => (s.obj.data_flags & 2) === 0, bin.Func(s => ({
			x: DDadjust(s, s.obj.insert_point.x),
			y: DDadjust(s, s.obj.insert_point.y),
		}))),
		RD2,
	),
    ext_point: BD3,
    thickness: BT,
    oblique: bin.Optional(s => (s.obj.data_flags & 4) === 0, BDV),
    angle: bin.Optional(s => (s.obj.data_flags & 8) === 0, BDV),
    height: BDV,
    widthscale: bin.Optional(s => (s.obj.data_flags & 16) === 0, BDV),
    text: TV,
    textgen: bin.Optional(s => (s.obj.data_flags & 0x20) === 0, BS),
    alignH: bin.Optional(s => (s.obj.data_flags & 0x40) === 0, BS),
    alignV: bin.Optional(s => (s.obj.data_flags & 0x80) === 0, BS),
}) {
	styleH!: H;
	parse_handles(bits: bitsin): void {
		super.parse_handles(bits);
		this.styleH = H.get(bits);
	}
};

class DRW_MTEXT extends Extend(Entity, {
    point1: BD3,
    ext_point: BD3,
    point2: BD3,
    widthscale: BD,
    rectHeight: minVer(VER.R2007, BD), // Reference rectangle height (BD 46)
    height: BD,
    textgen: BS,
    draw_dir: BS,
    ext_ht: BD,
    ext_wid: BD,
    text: TV,
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
		const version = bits.ver(VER.R2010) >= 0 ? R8.get(bits) : 0;
		const att_type = bits.ver(VER.R2018) >= 0 ? R8.get(bits) : 0;
		if (att_type > 1)
			this.mtext = new DRW_MTEXT(bits, true);
		this.annotation = bits.read_buffer(BS.get(bits));
		if (this.annotation.length !== 0)
			this.annotation_short = BS.get(bits);
		this.tag	= TV.get(bits);
		this.field_length = BS.get(bits);
		this.flags |= R8.get(bits);
		this.flags |= bits.with_flag(DRW_ATTRIB.lock);
		return true;
	}
}

class DRW_ATTDEF extends Extend(DRW_ATTRIB, {
	version: R8,
	prompt: TV,
}) {}

class DRW_SHAPE extends Extend(Entity, {
	ins_pt: BD3,
	scale: BD,
	rotation: BD,
	width_factor: BD,
	oblique_angle: BD,
	thickness: BD,
	style_id: BS,
	extrusion: BD3,
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
    point: BD3,
    thickness: BT,
    ext_point: BEXT,
    x_axis: BD,
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
	centre: BD3,
	radius: BD,
	thickness: BT,
	ext_point: BEXT,
}) {}

class DRW_ARC extends Extend(DRW_CIRCLE, {
	angle0: BD,
	angle1: BD
}) {}

class DRW_ELLIPSE extends Extend(Entity, {
	point1: BD3,
	point2: BD3,
	ext_point: BD3,
	ratio: BD,
	angle0: BD,
	angle1: BD // start/end angles in radians
}) {}

class DRW_TRACE extends Extend(Entity, {
	thickness: BT,
	point1: BD3,
	point2: BD3,
	point3: BD3,
	point4: BD3,
	ext_point: BEXT
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
	name: TV
}) {}

class DRW_ENDBLK extends Extend(Entity, {
	bit: minVer(VER.R2007, B)
}) {}

class DRW_SEQEND extends Entity {}

class DRW_INSERT extends Extend(Entity, {
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
				px = RD.get(s);
				py = RD.get(s);
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
	flags:	R8,
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
	flags:	R8,
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
	tflags: BS,
	curve_type: BS,
	width0: BD,
	width1: BD,
	thickness: BT,
	elevation: BD,
	ext_point: BEXT,
}) {}

class DRW_POLYLINE_3D extends Extend(Polyline, {
	flags:		R16,
	curve_type:	BS,
}) {}

class DRW_POLYLINE_PFACE extends Extend(Polyline, {
	vertexcount:	BS,
	facecount:		BS
}) {
}

class DRW_POLYLINE_MESH extends Extend(Polyline, {
	curve_type: BS,
	num_m_verts: BS,
	num_n_verts: BS,
	m_density: BS,
	n_density: BS
}) {}


class DRW_SPLINE extends Extend(Entity, {
	scenario: BL,
	x: bin.If(s => ver(s, VER.R2013) >= 0 && ((s as bitsin).get_bits(1) & 1) !== 0, {
		// scenario 2 fields
		fit_tol: BD,
		tangent0: BD3,
		tangent1: BD3,
		nfit: BL,
		fitlist: bin.ArrayType(s => s.obj.nfit, BD3)
	}, bin.If(s => s.obj.scenario === 1, {
		// scenario 1 fields
		flags: Bits(3),
		knot_tol: BD,
		control_tol: BD,
		nknots: BL,
		ncontrol: BL,
		weight: B,
		knotslist: bin.ArrayType(s => s.obj.nknots, BD),
		controllist: bin.ArrayType(s => s.obj.ncontrol, BD3),
		weightlist: bin.Optional(
			s => s.obj.weight,
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
	ratio: BD, param0: BD, param1: BD,
	isccw: B
};

const Spline = {
	degree:	BL,
	isRational: B, periodic: B,
	nknots:	BL, ncontrol: BL,
	knotslist: bin.ArrayType(s => s.obj.nknots, RD),
	controllist: bin.If(s => s.obj.isRational, bin.ArrayType(s => s.obj.ncontrol, RD3), bin.ArrayType(s => s.obj.ncontrol, RD2)),
	x: bin.If(s => ver(s, VER.R2010) >= 0, {
		fitlist: bin.ArrayType(BL, RD2),
		tangent0: RD2,
		tangent1: RD2,
	})
};

const HatchLoop = {
	type:	BL,
	x: bin.If(s => s.obj.type & 2, {
		objlist: bin.ArrayType(BL, bin.Switch(R8, {
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
	angle: BD,
	point: BD2,
	offset: BD2,
	dash: bin.ArrayType(BS, BD),
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
		1: {a: RD, b: RD},
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
	class_version: minVer(VER.R2010, R8),
	extrusion: BD3,
	text_midpt: RD2,
	elevation: BD,
	tflags: R8,
	user_text: TV,
	text_rotation: BD,
	horiz_dir: BD,
	ins_scale: BD3,
	ins_rotation: BD,
	attachment: minVer(VER.R2000, BS),
	lspace_style: minVer(VER.R2000, BS),
	lspace_factor: minVer(VER.R2000, BD),
	act_measurement: minVer(VER.R2000, BD),
	clone_ins_pt: RD2,
	styleH: H,
	blockH: H
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
	defpoint: BD3,
	def1: BD3,
	def2: BD3,
	oblique: BD
}) {}

class DRW_DIMENSION_ANG_LN2 extends Extend(Dimension, {
	arcPoint: RD2,
	def1: BD3,
	def2: BD3,
	centrePoint: BD3,
	defpoint: BD3
}) {}

class DRW_DIMENSION_ANG_PT3 extends Extend(Dimension, {
	defpoint: BD3,
	def1: BD3,
	def2: BD3,
	centrePoint: BD3
}) {}

class DRW_DIMENSION_RADIUS extends Extend(Dimension, {
	defpoint: BD3,
	circlePoint: BD3,
	radius: BD
}) {}

class DRW_DIMENSION_DIAMETER extends Extend(Dimension, {
	circlePoint: BD3,
	defpoint: BD3,
	radius: BD
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
		render_mode:	R8,
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

class ObjControl extends Obj {
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

class DRW_BLOCK_CONTROL_OBJ		extends ObjControl {
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
		const	n2 = bits.ver(VER.R2000) >= 0 ? R8.get(bits) : 0;

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
			R8.get(bits);
		} else {
			this.flags |= bits.with_flag(DRW_DICTIONARY.cloning);
			R8.get(bits);// hardowner
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
	name: TV,
	has_entity:	B,
	xrefindex: maxVer(VER.R2004, BS),
	xdep: B,
}) {}

class DRW_BLOCK_HEADER extends Extend(NamedObject, {
	flags: BS,
	insUnits: minVer(VER.R2007, BS),
	scaling: minVer(VER.R2007, R8),
	base_point: BD3,
	xref_path: TV,
	description: minVer(VER.R2000, TV),
	preview: minVer(VER.R2000, bin.Buffer(BL)),
	block: H,
	entities: HandleRange.read(s => s.obj.objcount),
	inserts: minVer(VER.R2000, bin.ArrayType(s => {
		let count = 0, i;
		while ((i = R8.get(s)) !== 0)
			count += i;
		return count;
	}, H)),
	layoutH: minVer(VER.R2000, H)
}) {}

class DRW_LAYER extends Extend(NamedObject, {
	x: bin.If(s => ver(s, VER.R14) <= 0, {
		frozen: B,
		unused: B,
		frozen2: B,
		locked: B,
	}, {
		flags:	BS,
		//lWeight: LineWidth,
	}),
	color: CMC,
	plotstyleH: minVer(VER.R2000, H),
	materialstyleH: minVer(VER.R2007, H),
	linetypeH: H
}) {}

// DRW_STYLE
class DRW_STYLE extends Extend(NamedObject, {
	flags: BS,
	height: BD,
	width: BD,
	oblique: BD,
	genFlag: R8,
	lastHeight: BD,
	font: TV,
	bigFont: TV
}) {}

// DRW_LTYPE
class DRW_LTYPE extends Extend(NamedObject, {
	desc: TV,
	align: R8,
	length: BD,
	path: bin.ArrayType(R8, {
		hash_length: BD,
		code: BS,
		x_offset: RD,
		y_offset: RD,
		scale: BD,
		rotation: BD,
		flags: BS
	}),
	strarea: maxVer(VER.R2004, bin.Buffer(256)),
	strarea2: bin.Optional(s => ver(s, VER.R2004) > 0, bin.Buffer(512)),
	dashH: bin.Optional(s => R8.get(s) > 0, H),
	shapeH: H
}) {}

// DRW_VIEW
class DRW_VIEW extends Extend(NamedObject, {
	height: BD,
	width: BD,
	center: BD2,
	view_target: BD3,
	view_dir: BD3,
	twist_angle: BD,
	LensLength: BD,
	front_clip: BD,
	back_clip: BD,
	ViewMode: Bits(4),
	render_mode: minVer(VER.R2000, RenderMode),
	ucs: minVer(VER.R2000, bin.Optional(B, UserCoords)),
	BackgroundH: minVer(VER.R2007, H),
	VisualStyleH: minVer(VER.R2007, H),
	SunH: minVer(VER.R2007, H),
	BaseUCSH: minVer(VER.R2000, H),
	NamedUCSH: minVer(VER.R2000, H),
	LiveSectionH: minVer(VER.R2007, H)
}) {}

// DRW_UCS
class DRW_UCS extends Extend(NamedObject, {
	ucs: UserCoords,
	ortho_type: minVer(VER.R2000, BS)
}) {}

// DRW_VPORT
class DRW_VPORT extends Extend(NamedObject, {
	lower_left: BD2,
	upper_right: BD2,
	center: BD2,
	snap_base: BD2,
	snap_spacing: BD2,
	grid_spacing: BD2,
	view_dir: BD3,
	view_target: BD3,
	height: BD,
	ratio: BD,
	lensHeight: BD,
	front_clip: BD,
	back_clip: BD,
	snap_angle: BD,
	twist_angle: BD,
	view_mode: Bits(4),
	circleZoom: BS,
	snap_isopair: BS,
	gridBehavior: minVer(VER.R2007, BS),
	grid_major: minVer(VER.R2007, BS),
	render_mode: minVer(VER.R2000, RenderMode),
	ucs: minVer(VER.R2000, UserCoords),
	bkgrdH: minVer(VER.R2007, H),
	visualStH: minVer(VER.R2007, H),
	sunH: minVer(VER.R2007, H),
	namedUCSH: minVer(VER.R2000, H),
	baseUCSH: minVer(VER.R2000, H)
}) {}

// DRW_APPID
class DRW_APPID extends Extend(NamedObject, {
	unknown: bin.Optional(s => true, R8)
}) {}

// DRW_DIMSTYLE
class DRW_DIMSTYLE extends Extend(NamedObject, {
	dim: DimStyle
}) {}

// DRW_VP_ENT_HDR
class DRW_VP_ENT_HDR extends NamedObject {}

// DRW_LAYOUT
class DRW_LAYOUT extends NamedObject {}

// DRW_IMAGEDEF
class DRW_IMAGEDEF extends Extend(NamedObject, {
	name: TV,
	version: BL,
	imageSize: BD2,
	pixelSize: BD2,
	loaded: B,
	resolution: R8
}) {}

// DRW_GROUP
class DRW_GROUP extends Extend(NamedObject, {
	name: TV,
	handles: bin.ArrayType(BL, H),
	flags: Bits(2)
}) {}


// DRW_DICTIONARYVAR
class DRW_DICTIONARYVAR extends Extend(Obj, {
	name: TV,
	value: R8
}) {}

// DRW_MLINESTYLE
class DRW_MLINESTYLE extends Extend(Obj, {
	name: TV,
	desc: TV,
	mlineflags: BS,
	fillcolor: CMC,
	angle0: BD,
	angle1: BD,
	items: bin.ArrayType(R8, {
		offset: BD,
		color: CMC,
		lineindex: BS,
		linetype: bin.Optional(s => ver(s, VER.R2018) < 0, H),
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
	EvaluatorID: TV,
	FieldCode: TV,
	num_children: 	BL,
	num_objects: 	BL,
	FormatString: maxVer(VER.R2004, TV),
	EvaluationFlags: BL,
	FilingFlags: BL,
	StateFlags: BL,
	EvalStatusFlags: BL,
	EvalErrorCode: BL,
	EvaluationError: TV,
	value: Value,
	ValueString: TV,
	ValueStringLength: TV,
	child_fields: bin.ArrayType(BL, {k: TV, v: Value}),
}) {
	children: H[];
	objects: H[];
	constructor(bits: bitsin2) {
		super(bits);
		this.children = bin.readn(bits, H, this.num_children);
		this.objects = bin.readn(bits, H, this.num_objects);
	}
}


// DRW_PLOTSETTINGS
class DRW_PLOTSETTINGS extends Extend(Obj, {
	name: TV,
	marginLeft: BD,
	marginBottom: BD,
	marginRight: BD,
	marginTop: BD
}) {}

// DRW_TABLESTYLE

const RowStyle = {
	text_style: H,
	text_height: BD,
	text_align: BS,
	text_colour: CMC,
	fill_colour: CMC,
	bk_color_enabled: B
};

const CellStyle = {
	style_type: BL,
	x: bin.If(BS, {
		PropertyOverrideFlags: BL,
		MergeFlags: BL,
		BackgroundColor: CMC,
		ContentLayoutFlags: BL,
		ContentFormat: ContentFormat,
		x:bin.If(BS, {
			VerticalMargin: BD,
			HorizontalMargin: BD,
			BottomMargin: BD,
			RightMargin: BD,
			MarginHorizontalSpacing: BD,
			MarginVerticalSpacing: BD,
		}),
		borders: bin.ArrayType(BL, H),
		id: BL,
	}),
	type: BL,
	name: TV
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
	unknown: R8,
	num_obj_ids: BL
}) {}

// AcDbObjectContextData
const AcDbObjectContextData = {
	class_version: BS,
	is_default: B
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
	override_code: R8
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

type OBJECTTYPE = {index: number} & (new(bits: bitsin2)=>Obj);
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
	VIEWPORT:				O(0x22, DRW_VIEWPORT as any),				//	E
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
	HATCH:					O(0x4E, DRW_HATCH as any),					//	E
	XRECORD:				O(0x4F, DRW_XRECORD),				//	o
	ACDBPLACEHOLDER:		O(0x50, DRW_ACDBPLACEHOLDER),		//	o	aka PLACEHOLDER
	VBA_PROJECT:			O(0x51, DRW_VBA_PROJECT),			//	o
	LAYOUT:					O(0x52, DRW_LAYOUT),				//	o
	IMAGE:					O(0x65, DRW_IMAGE),					//	E
	IMAGEDEF:				O(0x66, DRW_IMAGEDEF),				//	O
	ACAD_PROXY_ENTITY:		O(0x1f2, DRW_ACAD_PROXY_ENTITY),	//	e
	ACAD_PROXY_OBJECT:		O(0x1f3, DRW_ACAD_PROXY_OBJECT),	//	o
	_LOOKUP:				{index: 0x1f4} as OBJECTTYPE		//
	// ... add all other mappings ...
};


const OBJECTTYPE = Object.assign(OBJECTTYPES, {
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
			return this.FromInt(R16.get(s));
		} else {
			switch (s.get_bits(2)) {
				case 0:
					return this.FromInt(R8.get(s));
				case 1:
					return this.FromInt(R8.get(s) + 0x1f0);
				default:
					return this.FromInt(R16.get(s));
			}
		}
	}
});


//-----------------------------------------------------------------------------
// Main class
//-----------------------------------------------------------------------------

class FileReader {
	pos		= 0;
	
	constructor(public fd: fs.FileHandle, public size: number) {}

	static async create(filename: string) {
		const stats = await fs.stat(filename);
		return new FileReader(await fs.open(filename, 'r'), stats.size);
	}

	remaining(): number {
		return this.size - this.pos;
	}
	tell(): number {
		return this.pos;
	}
	seek(offset: number): void {
		this.pos = offset;
	}
	skip(offset: number): void {
		this.pos += offset;
	}
	async read_buffer(len: number) {
		const buffer = Buffer.alloc(len);
		const {bytesRead} =  await this.fd.read(buffer, 0, len, this.pos);
		this.pos += bytesRead;
		return buffer;
	}
}

class MoveableClass extends bin.Class({
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

class ObjectHandle {
	ref?: WeakRef<Obj>;
	get obj()					{ return this.ref?.deref(); }
	set obj(obj: Obj|undefined)	{ this.ref = obj ? new WeakRef(obj) : undefined; }

	constructor(public h: number, public loc: number) {}
	compareTo(o: number) {
		return this.h < o ? -1 : this.h > o ? 1 : 0;
	}
};

class Table<T extends Obj> {
	control: ObjControl;

	[Symbol.iterator]() {
		const dwg		= this.dwg;
		const handles = this.control.handles;
		let i = 0;
		return {
			next(): IteratorResult<T> {
				if (i != handles.length)
					return {done: false, value: dwg.get_object(handles[i++])};
				else
					return {done: true, value: undefined!};
			}
		};
	}

	constructor(public dwg: DWG, ctrl: H, ctype: OBJECTTYPE) {
		this.control = dwg.get_object(ctrl.offset());
	}
};

class UCSstuff extends bin.Class({
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


class HeaderVars extends bin.Class({
	requiredVersions: minVer(VER.R2013, bin.ArrayType(BL, BL)),
	_unk1: BD, _unk2: BD, _unk3: BD, _unk4: BD,
	_unk5: TV, _unk6: TV, _unk7: TV, _unk8: TV,
	_unk9: BL, _unk10: BL,
	_unk11: maxVer(VER.R14, BS),
	_unk12: maxVer(VER.R2000, H),
	DIMASO: B,
	DIMSHO: B,
	DIMSAV: maxVer(VER.R14, B),
	PLINEGEN: B,
	ORTHOMODE: B,
	REGENMODE: B,
	FILLMODE: B,
	QTEXTMODE: B,
	PSLTSCALE: B,
	LIMCHECK: B,
	BLIPMODE: B,
	USRTIMER: B,
	SKPOLY: B,
	ANGDIR: B,
	SPLFRAME: B,
	ATTREQ_ATTDIA: bin.If(s => ver(s, VER.R14) <= 0, {
		ATTREQ: B,
		ATTDIA: B,
	}),
	MIRRTEXT: B,
	WORLDVIEW: B,
	WIREFRAME: maxVer(VER.R14, B),
	TILEMODE: B,
	PLIMCHECK: B,
	VISRETAIN: B,
	DELOBJ: maxVer(VER.R14, B),
	DISPSILH: B,
	PELLIPSE: B,
	PROXIGRAPHICS: BS,
	DRAGMODE: maxVer(VER.R14, BS),
	TREEDEPTH: BS,
	LUNITS: BS,
	LUPREC: BS,
	AUNITS: BS,
	AUPREC: BS,
	OSMODE: maxVer(VER.R14, BS),
	ATTMODE: BS,
	COORDS: maxVer(VER.R14, BS),
	PDMODE: BS,
	PICKSTYLE: maxVer(VER.R14, BS),
	_unk13_15: bin.If(s => ver(s, VER.R2004) >= 0, {
		_unk13: BL,
		_unk14: BL,
		_unk15: BL,
	}),
	USERI1: BS,
	USERI2: BS,
	USERI3: BS,
	USERI4: BS,
	USERI5: BS,
	SPLINESEGS: BS,
	SURFU: BS,
	SURFV: BS,
	SURFTYPE: BS,
	SURFTAB1: BS,
	SURFTAB2: BS,
	SPLINETYPE: BS,
	SHADEDGE: BS,
	SHADEDIF: BS,
	UNITMODE: BS,
	MAXACTVP: BS,
	ISOLINES: BS,
	CMLJUST: BS,
	TEXTQLTY: BS,
	LTSCALE: BD,
	TEXTSIZE: BD,
	TRACEWID: BD,
	SKETCHINC: BD,
	FILLETRAD: BD,
	THICKNESS: BD,
	ANGBASE: BD,
	PDSIZE: BD,
	PLINEWID: BD,
	USERR1: BD,
	USERR2: BD,
	USERR3: BD,
	USERR4: BD,
	USERR5: BD,
	CHAMFERA: BD,
	CHAMFERB: BD,
	CHAMFERC: BD,
	CHAMFERD: BD,
	FACETRES: BD,
	CMLSCALE: BD,
	CELTSCALE: BD,
	MENU: TV,
	TDCREATE: TIME,
	TDUPDATE: TIME,
	// R2004+ block
	_unk16_18: bin.If(s => ver(s, VER.R2004) >= 0, {
		_unk16: BL,
		_unk17: BL,
		_unk18: BL,
	}),
	TDINDWG: TIME,
	TDUSRTIMER: TIME,
	CECOLOR: CMC,
	HANDSEED: H,
	CLAYER: H,
	TEXTSTYLE: H,
	CELTYPE: H,
	CMATERIAL: minVer(VER.R2007, H),
	DIMSTYLE: H,
	CMLSTYLE: H,
	PSVPSCALE: minVer(VER.R2000, BD),
	PUCS: UCSstuff,
	UCS: UCSstuff,
	dim: DimStyle,
	BLOCK_CONTROL: H,
	LAYER_CONTROL: H,
	TEXTSTYLE_CONTROL: H,
	LINETYPE_CONTROL: H,
	VIEW_CONTROL: H,
	UCS_CONTROL: H,
	VPORT_CONTROL: H,
	APPID_CONTROL: H,
	DIMSTYLE_CONTROL: H,
	VP_ENT_HDR_CONTROL: maxVer(VER.R2000, H),
	GROUP_CONTROL: H,
	MLINESTYLE_CONTROL: H,
	// R2000+ block
	DICT_BLOCK: bin.If(s => ver(s, VER.R2000) >= 0, {
		DICT_NAMED_OBJS: H,
		TSTACKALIGN: BS,
		TSTACKSIZE: BS,
		HYPERLINKBASE: TV,
		STYLESHEET: TV,
		LAYOUTS_CONTROL: H,
		PLOTSETTINGS_CONTROL: H,
		DICT_PLOTSTYLES: H,
		// R2004+ block
		DICT_MATERIALS_COLORS: bin.If(s => ver(s, VER.R2004) >= 0, {
			DICT_MATERIALS: H,
			DICT_COLORS: H,
		}),
		// R2007+ block
		DICT_VISUALSTYLE: bin.If(s => ver(s, VER.R2007) >= 0, {
			DICT_VISUALSTYLE: H,
		}),
		// R2013+ block
		DICT_UNKNOWN: bin.If(s => ver(s, VER.R2013) >= 0, {
			DICT_UNKNOWN: H,
		}),
		_unk19: BL,
		INSUNITS: BS,
		CEPSNTYPE: BS,
		CPSNID: bin.Optional(s => s.obj.CEPSNTYPE === 3, H),
		FINGERPRINTGUID: TV,
		VERSIONGUID: TV,
		// R2004+ block
		SORTENTS_BLOCK: bin.If(s => ver(s, VER.R2004) >= 0, {
			SORTENTS: R8,
			INDEXCTL: R8,
			HIDETEXT: R8,
			XCLIPFRAME: R8,
			DIMASSOC: R8,
			HALOGAP: R8,
			OBSCUREDCOLOR: BS,
			INTERSECTIONCOLOR: BS,
			OBSCUREDLTYPE: R8,
			INTERSECTIONDISPLAY: R8,
			PROJECTNAME: TV,
		}),
	}),
	BLOCK_PAPER_SPACE: H,
	BLOCK_MODEL_SPACE: H,
	LTYPE_BYLAYER: H,
	LTYPE_BYBLOCK: H,
	LTYPE_CONTINUOUS: H,
	// R2007+ block
	CAMERA_BLOCK: bin.If(s => ver(s, VER.R2007) >= 0, {
		CAMERADISPLAY: B,
		_unk20: BL,
		_unk21: BL,
		_unk22: BD,
		STEPSPERSEC: BD,
		STEPSIZE: BD,
		_3DDWFPREC: BD,
		LENSLENGTH: BD,
		CAMERAHEIGHT: BD,
		SOLIDHIST: R8,
		SHOWHIST: R8,
		PSOLWIDTH: BD,
		PSOLHEIGHT: BD,
		LOFTANG1: BD,
		LOFTANG2: BD,
		LOFTMAG1: BD,
		LOFTMAG2: BD,
		LOFTPARAM: BS,
		LOFTNORMALS: R8,
		LATITUDE: BD,
		LONGITUDE: BD,
		NORTHDIRECTION: BD,
		TIMEZONE: BL,
		LIGHTGLYPHDISPLAY: R8,
		TILEMODELIGHTSYNCH: R8,
		DWFFRAME: R8,
		DGNFRAME: R8,
		_unk23: B,
		INTERFERECOLOR: CMC,
		INTERFEREOBJVS: H,
		INTERFEREVPVS: H,
		DRAGVS: H,
		CSHADOW: R8,
		_unk24: BD,
	}),
	// R14+ block
	UNK25_28: bin.If(s => ver(s, VER.R14) >= 0, {
		_unk25: BS,
		_unk26: BS,
		_unk27: BS,
		_unk28: BS,
	}),
}) {}

class HeaderBase {
	data: Uint8Array;
	constructor(b: HeaderBase);
	constructor(file: any);
	constructor(arg: any) {
		if (arg instanceof HeaderBase) {
			this.data = arg.data;
		} else {
			this.data = arg.readbuff(128);
		}
	}
	version(): VER {
		let v = 0;
		for (let i = 2; i < 11 && this.data[i] >= 48 && this.data[i] <= 57; i++)
			v = v * 10 + this.data[i] - 48;
		return VER.FromInt(v);
	}
	valid(): VER {
		return this.data[0] === 65 && this.data[1] === 67 ? this.version() : VER.BAD;
	}
}

export class DWG {
	object_file!:	reader;
	classes			= new Map<OBJECTTYPE, MoveableClass>;
	handles: ObjectHandle[] = [];
	code_page		= 0;
	version			= VER.BAD;
	maintenanceVersion = 0;
	comments		= '';
	name			= '';
	vars!:			HeaderVars;
	blocks!:		Table<DRW_BLOCK_HEADER>;
	layers!:		Table<DRW_LAYER>;
	textstyles!: 	Table<DRW_STYLE>;
	linetypes!:		Table<DRW_LTYPE>;
	views!:			Table<DRW_VIEW>;
	ucss!:			Table<DRW_UCS>;
	vports!:		Table<DRW_VPORT>;
	appids!:		Table<DRW_APPID>;
	dimstyles!:		Table<DRW_DIMSTYLE>;
	vpEntHeaders!:	Table<DRW_VP_ENT_HDR>;
	groups!:		Table<DRW_GROUP>;
	mlinestyles!:	Table<DRW_MLINESTYLE>;
	layouts!:		Table<DRW_LAYOUT>;
	plotsettings!:	Table<DRW_PLOTSETTINGS>;

	get_object(handle: number): any {
		const i = this.handles.findIndex(h => h.h === handle);
		if (i < 0)
			return null;
		const mit = this.handles[i];
		let obj = mit.obj;
		if (!obj) {
			const file = this.object_file;
			file.seek(mit.loc);
			let size = R16.get(file);
			if ((size & 0x8000) !== 0)
				size += (R16.get(file) << 15) - 0x8000;
			const bsize = this.version >= VER.R2010 ? size * 8 - MC.get(file) : size * 8;
			const offset = file.tell() - mit.loc;
			file.seek(mit.loc);
			const data = file.read_buffer(size + offset + 2);
			const crc16 = new CRC16(0xc0c1);
			crc16.update(data);
			if (crc16.getValue() !== 0)
				return null;
			const bits = new bitsin(data.slice(offset, data.length - 2), this.version);
			bits.size = bsize;

			const soffset = get_string_offset(bits, bsize);
			const bits2 = soffset !== 0 ? new bitsin2(bits, new bitsin(bits), soffset) : new bitsin2(bits);
			let type = OBJECTTYPE.get(bits2);
			bits2.seek_bit(0);

			if (type && type.index >= OBJECTTYPE._LOOKUP.index) {
				const it = this.classes.get(type);
				if (!it)
					return null;
				type = OBJECTTYPE.FromInt(it.type);
			}
			obj		= type ? new type(bits2) : undefined;
			mit.obj	= obj;
		}
		return obj;
	}

	read_header(bits: bitsin3) {
		this.vars = new HeaderVars(bits);
	}

	read_classes(bits: bitsin2, size: number) {
		this.classes = new Map();
		while (bits.tell_bit() < size)
			this.classes.set(OBJECTTYPE.FromInt(BS.get(bits))!, MoveableClass.get(bits));
	}

	read_handles(file: any) {
		const handles1: ObjectHandle[] = [];
		while (!file.eof()) {
			const size = bin.UINT16_BE.get(file);
			file.seek_cur(-2);
			const temp	= file.readbuff(size);
			const mr2	= new bin.stream(temp);
			mr2.seek(2);
			let handle = 0;
			let loc = 0;
			while (mr2.remaining()) {
				handle	+= MC.get(mr2);
				loc		+= MCS.get(mr2);
				handles1.push(new ObjectHandle(handle, loc));
			}
			const crc_read	= bin.UINT16_BE.get(file);
			const crc16		= new CRC16(0xc0c1);
			crc16.update(temp);
			if (crc16.getValue() !== crc_read)
				throw new Error('CRC mismatch');
		}
		this.handles = handles1;
	}

	read_tables(file: any) {
		this.object_file = file;
		this.blocks 	= new Table(file, this.vars.BLOCK_CONTROL, OBJECTTYPE.BLOCK_CONTROL_OBJ);
		this.layers 	= new Table(file, this.vars.LAYER_CONTROL, OBJECTTYPE.LAYER_CONTROL_OBJ);
		this.textstyles = new Table(file, this.vars.TEXTSTYLE_CONTROL, OBJECTTYPE.STYLE_CONTROL_OBJ);
		this.linetypes 	= new Table(file, this.vars.LINETYPE_CONTROL, OBJECTTYPE.LTYPE_CONTROL_OBJ);
		this.views 		= new Table(file, this.vars.VIEW_CONTROL, OBJECTTYPE.VIEW_CONTROL_OBJ);
		this.ucss 		= new Table(file, this.vars.UCS_CONTROL, OBJECTTYPE.UCS_CONTROL_OBJ);
		this.vports 	= new Table(file, this.vars.VPORT_CONTROL, OBJECTTYPE.VPORT_CONTROL_OBJ);
		this.appids 	= new Table(file, this.vars.APPID_CONTROL, OBJECTTYPE.APPID_CONTROL_OBJ);
		this.dimstyles 	= new Table(file, this.vars.DIMSTYLE_CONTROL, OBJECTTYPE.DIMSTYLE_CONTROL_OBJ);

		if (this.vars.VP_ENT_HDR_CONTROL)
			this.vpEntHeaders = new Table(file, this.vars.VP_ENT_HDR_CONTROL, OBJECTTYPE.VP_ENT_HDR_CTRL_OBJ);

		this.groups			= new Table(file, this.vars.GROUP_CONTROL, OBJECTTYPE.DICTIONARY);
		this.mlinestyles	= new Table(file, this.vars.MLINESTYLE_CONTROL, OBJECTTYPE.DICTIONARY);
//		this.layouts		= new Table(file, this.vars.LAYOUTS_CONTROL, OBJECTTYPE.DICTIONARY);
//		this.plotsettings	= new Table(file, this.vars.PLOTSETTINGS_CONTROL, OBJECTTYPE.DICTIONARY);
	}


	async open(filename: string) {
		try {
			const file	= await FileReader.create(filename);
			const head	= new HeaderBase(file);
			const version = head.valid();
			switch (version) {
				case VER.R13:
				case VER.R14:
				case VER.R2000:
					return read12(this, file, head, version);
				case VER.R2007:
					return read21(this, file, head);
				case VER.R2004:
				case VER.R2010:
				case VER.R2013:
				case VER.R2018:
					return read18(this, file, head);
				default:
					return false;
			}

		} catch (_e) {
			return false;
		}
	}

	DWG(filename?: string) {
		if (filename)
			this.open(filename);
	}

};

//-----------------------------------------------------------------------------
// DWG readers
//-----------------------------------------------------------------------------

class bit_seeker {
	end: number;
	constructor(public bits: bitsin, size: number) {
		this.end = bits.tell_bit() + size;
	}
	close() { this.bits.seek_bit(this.end); }
};

function get_string_offset(bits: bitsin, bsize: number) {
	const bs = new bit_seeker(bits, 0);
	let	offset = 0;
	if (bits.ver(VER.R2007) >= 0) {
		bits.seek_bit(bsize - 1);
		if (bits.get_bit()) {
			bits.seek_bit(bsize - 17);
			let	ssize	= R16.get(bits);
			if ((ssize & 0x8000) != 0) {
				bits.seek_bit(bsize - 33);
				ssize = ((ssize & 0x7fff) + (R16.get(bits) << 15)) + 16;
			}
			offset = bsize - ssize - 17;
		}
	}
	bs.close();
	return offset;
}


const fileheader_sentinel	= new Uint8Array([0x95, 0xA0, 0x4E, 0x28, 0x99, 0x82, 0x1A, 0xE5, 0x5E, 0x41, 0xE0, 0x5F, 0x9D, 0x3A, 0x4D, 0x00]);
const header_sentinel		= new Uint8Array([0xCF, 0x7B, 0x1F, 0x23, 0xFD, 0xDE, 0x38, 0xA9, 0x5F, 0x7C, 0x68, 0xB8, 0x4E, 0x6D, 0x33, 0x5F]);
const header_sentinel_end	= new Uint8Array([0x30, 0x84, 0xE0, 0xDC, 0x02, 0x21, 0xC7, 0x56, 0xA0, 0x83, 0x97, 0x47, 0xB1, 0x92, 0xCC, 0xA0]);
const classes_sentinel		= new Uint8Array([0x8D, 0xA1, 0xC4, 0xB8, 0xC4, 0xA9, 0xF8, 0xC5, 0xC0, 0xDC, 0xF4, 0x5F, 0xE7, 0xCF, 0xB6, 0x8A]);
const classes_sentinel_end	= new Uint8Array([0x72, 0x5E, 0x3B, 0x47, 0x3B, 0x56, 0x07, 0x3A, 0x3F, 0x23, 0x0B, 0xA0, 0x18, 0x30, 0x49, 0x75]);

function check_sentinel(data: Uint8Array, sentinel: Uint8Array) {
	for (let i = 0; i < sentinel.length; i++) {
		if (data[i] !== sentinel[i])
			throw new Error("Bad sentinel");
	}
}

class decompress_dwg {
	compPos = 0;
	compGood = true;
	decompPos = 0;
	decompGood = true;
	constructor(public compBuffer: Uint8Array, public decompBuffer: Uint8Array) {}
	buffersGood(): boolean {
		return this.compGood && this.decompGood;
	}
	compressedByte(): number {
		this.compGood = this.compPos < this.compBuffer.length;
		return this.compGood ? this.compBuffer[this.compPos++] & 0xff : 0;
	}
	decompSet(value: number): void {
		this.decompGood = this.decompPos < this.decompBuffer.length;
		if (this.decompGood)
			this.decompBuffer[this.decompPos++] = value;
	}
	copy(offset: number, count: number): boolean {
		if (offset > this.decompPos || this.decompPos + count >= this.decompBuffer.length)
			return false;
		for (let end = this.decompPos + count; this.decompPos < end; ++this.decompPos)
			this.decompBuffer[this.decompPos] = this.decompBuffer[this.decompPos - offset];
		return true;
	}
}

//-----------------------------------------------------------------------------
// R13/R14/R2000 format reader
//-----------------------------------------------------------------------------

async function read12(dwg: DWG, file: FileReader, h0: HeaderBase, version: VER) {
	const HEADER = 0, CLASSES = 1, HANDLES = 2;
	class Section extends bin.Class({
		id:			R8,
		address:	R32,
		size:		R32,
	}) {
		async data() {
			file.seek(this.address);
			return file.read_buffer(this.size);
		}
		async reader() {
			return new bin.stream(await this.data());
		}
	}

	const mr = new bin.stream(h0.data);
	mr.seek(0x15);
	const sections = bin.ArrayType(R32, Section).get(mr);

	// Calculate and verify CRC16
	const pos = file.tell();
	file.seek(0);
	const crc16 = new CRC16();
	crc16.updateBuffer(await file.read_buffer(pos), 0, pos);
	let ckcrc = crc16.getValue();

	switch (sections.length) {
		case 3:		ckcrc ^= 0xA598; break;
		case 4:		ckcrc ^= 0x8101; break;
		case 5:		ckcrc ^= 0x3CC4; break;
		case 6:		ckcrc ^= 0x8461;
	}

	if (R16.get(mr) !== (ckcrc & 0xffff))
		throw new Error("CRC mismatch");
	check_sentinel(await file.read_buffer(16), fileheader_sentinel);

	// Read header
	const headerData = await sections[HEADER].data();
	check_sentinel(headerData, header_sentinel);
	dwg.read_header(new bitsin3(new bitsin2(new bitsin(headerData, version))));

	// Read classes
	const classesData = await sections[CLASSES].data();
	check_sentinel(classesData, classes_sentinel);
	const classesFile = new bin.stream(classesData);
	classesFile.seek(16);
	const classesSize = R16.get(classesFile);
	classesFile.seek(0);
	dwg.read_classes(new bitsin2(new bitsin(classesData, version)), (classesSize - 1) * 8);

	// Read handles
	dwg.read_handles(sections[HANDLES].reader());

	// Read tables
	dwg.read_tables(file);
}


//-----------------------------------------------------------------------------
// R2004/R2010/R2013/R2018 format reader
//-----------------------------------------------------------------------------

class decompress18 extends decompress_dwg {
	constructor(compBuffer: Uint8Array, decompBuffer: Uint8Array) {
		super(compBuffer, decompBuffer);
	}

	process(): boolean {
		let litCount = 0;
		while (this.buffersGood()) {
			if (litCount === 0) {
				let b = this.compressedByte();
				if (b > 0x0F) {
					--this.compPos;
				} else {
					if (b === 0) {
						litCount = 0x0f;
						b = this.compressedByte();
						while (b === 0 && this.compGood) {
							litCount += 0xFF;
							b = this.compressedByte();
						}
					}
					litCount += b + 3;
				}
			}
			for (let i = 0; i < litCount && this.buffersGood(); ++i)
				this.decompSet(this.compressedByte());
			let oc = this.compressedByte();
			let compBytes = 0;
			let compOffset = 0;
			if (oc < 0x40) {
				if (oc < 0x10)
					return false;
				if (oc === 0x11)
					return true;
				if (oc === 0x10 || oc === 0x20) {
					compBytes = 0;
					let b = this.compressedByte();
					while (b === 0 && this.compGood) {
						compBytes += 0xFF;
						b = this.compressedByte();
					}
					compBytes += b + (oc === 0x10 ? 0x09 : 0x21);
				} else {
					compBytes = oc - (oc < 0x20 ? 0x0e : 0x1e);
				}
				compOffset = oc < 0x20 ? 0x3FFF : 0;
				oc = this.compressedByte();
				compOffset += (this.compressedByte() << 6) | (oc >> 2);
			} else {
				compBytes = (oc >> 4) - 1;
				compOffset = (this.compressedByte() << 2) | ((oc & 0x0C) >> 2);
			}
			this.copy(compOffset + 1, compBytes);
			litCount = oc & 3;
		}
		return false;
	}
}

function checksum18(seed: number, data: Uint8Array): number {
	let sum1 = seed & 0xffff;
	let sum2 = (seed >>> 16) & 0xffff;
	for (let i = 0; i < data.length;) {
		for (let chunk_end = Math.min(data.length, i + 0x15b0); i < chunk_end; ++i) {
			sum1 = (sum1 + data[i]) & 0xffff;
			sum2 = (sum2 + sum1) & 0xffff;
		}
		sum1 %= 0xFFF1;
		sum2 %= 0xFFF1;
	}
	return ((sum2 & 0xffff) << 16) | (sum1 & 0xffff);
}

async function read18(dwg: DWG, file: FileReader, h0: HeaderBase) {
	const SYS_SECTION	= 0x41630e3b;
	const DATA_SECTION	= 0x4163043b;
	const MAP_SECTION	= 0x4163003b;

	class SystemPage extends bin.Class({
		page_type: 			R32,
		decompressed_size:  R32,
		compressed_size:  	R32,
		compression_type:  	R32,
		header_checksum:  	R32,
	}) {
		async parse(file: FileReader) {
			const data	= await file.read_buffer(this.compressed_size);
			const out	= new Uint8Array(this.decompressed_size);
			const comp	= new decompress18(data, out);
			return comp.process() ? out : null;
		}
	}

	class DataSection extends bin.Class({
		page_type: 			R32,
		section: 			R32,
		compressed_size: 	R32,
		decompressed_size: 	R32,
		offset: 			R32,
		header_checksum: 	R32,
		data_checksum: 		R32,
		unknown: 			R32,
	}) {
		constructor(file: reader, address: number) {
			super(file);
			const x = 0x4164536b ^ address;
			this.section 			^= x;
			this.compressed_size 	^= x;
			this.decompressed_size 	^= x;
			this.offset 			^= x;
			this.header_checksum 	^= x;
			this.data_checksum 		^= x;
			this.unknown 			^= x;
		}
	}

	class PageMap {
		entries = new Map<number, {size: number, address: number}>;

		constructor(mem: Uint8Array) {
			const file = new bin.stream(mem);
			let address = 0x100;
			while (file.remaining()) {
				const page = R32.get(file);
				const size = R32.get(file);
				if (page < 0)
					file.skip(4 * 4);
				else
					this.entries.set(page, {size, address});
				address += size;
			}
		}
	}

	class Page extends bin.Class({
		page:	R32,
		size:	R32,
		offset:	R64,
	}) {
		address: number;
		data?: Uint8Array;
		constructor(file: reader, page_map: PageMap) {
			super(file);
			this.address = page_map.entries.get(this.page)?.address ?? 0;
		}

		async get_data(file: FileReader, page_size: number) {
			if (this.data)
				return this.data;
			file.seek(this.address);
			const h				= new DataSection(new bin.stream(await file.read_buffer(32)), this.address);
			const comp_data		= await file.read_buffer(h.compressed_size);
			const decomp_data	= new Uint8Array(page_size);
			const comp			= new decompress18(comp_data, decomp_data);
			if (!comp.process())
				return null;
			this.data = decomp_data;
			return decomp_data;
		}
	}

	class SectionInfo extends bin.Class({
		size:				R64,
		PageCount:			R32,
		page_size:			R32,
		unknown:			R32,
		compression_type:	R32,
		section_id:			R32,
		encrypted:			R32,
		name:				bin.StringType(64, 'utf8'),
	}) {
		pages: Page[] = [];
		constructor(file: reader, page_map: PageMap) {
			super(file);
			for (let i = 0; i < this.PageCount; ++i)
				this.pages.push(new Page(file, page_map));
		}

		async parse(file: FileReader) {
			const out = new Uint8Array(Number(this.size));
			for (const p of this.pages) {
				const page_data = await p.get_data(file, this.page_size);
				if (!page_data)
					return new Uint8Array();
				const n = Math.min(Number(this.size) - Number(p.offset), this.page_size);
				for (let j = 0; j < n; ++j)
					out[Number(p.offset) + j] = page_data[j];
			}
			return out;
		}
	}

	class SectionMap {
		sections = new Map<string, SectionInfo>;

		constructor(mem: Uint8Array, page_map: PageMap) {
			const file = new bin.stream(mem);
			while (file.remaining()) {
				const sect = new SectionInfo(file, page_map);
				this.sections.set(sect.name, sect);
			}
		}

		async data(file: FileReader, name: string) {
			const si = this.sections.get(name);
			return si ? await si.parse(file) : new Uint8Array();
		}
	}

	file.seek(0);
	const sys1 = new SystemPage(new bin.stream(await file.read_buffer(20)));
	const map_data = await sys1.parse(file);
	if (!map_data)
		return false;

	const page_map = new PageMap(map_data);

	// Get section map
	const map_section_entry = page_map.entries.values().next().value;
	if (!map_section_entry)
		return false;

	file.seek(map_section_entry.address);
	const sys2 = new SystemPage(new bin.stream(await file.read_buffer(20)));
	const sections_data = await sys2.parse(file);
	if (!sections_data)
		return false;

	const section_map = new SectionMap(sections_data, page_map);

	// Read Header
	const header_data = await section_map.data(file, "AcDb:Header");
	check_sentinel(header_data, header_sentinel);
	const ver = h0.version();
	dwg.read_header(new bitsin3(new bitsin2(new bitsin(header_data, ver))));

	// Read Classes
	const classes_data = await section_map.data(file, "AcDb:Classes");
	check_sentinel(classes_data, classes_sentinel);
	dwg.read_classes(new bitsin2(new bitsin(classes_data, ver)), classes_data.length * 8);

	// Read Handles
	const handles_data = await section_map.data(file, "AcDb:Handles");
	dwg.read_handles(new bin.stream(handles_data));

	// Read Tables
	const tables_data = await section_map.data(file, "AcDb:AcDbObjects");
	dwg.read_tables(new bin.stream(tables_data));

	return true;
}

//-----------------------------------------------------------------------------
// R21 readers
//-----------------------------------------------------------------------------

class decompress21 extends decompress_dwg {
	static MaxBlockLength = 32;
	static CopyOrder = [
		[],
		[0],
		[1,0],
		[2,1,0],
		[0,1,2,3],
		[4,0,1,2,3],
		[5,1,2,3,4,0],
		[6,5,1,2,3,4,0],
		[0,1,2,3,4,5,6,7],
		[8,0,1,2,3,4,5,6,7],
		[9,1,2,3,4,5,6,7,8,0],
		[10,9,1,2,3,4,5,6,7,8,0],
		[8,9,10,11,0,1,2,3,4,5,6,7],
		[12,8,9,10,11,0,1,2,3,4,5,6,7],
		[13,9,10,11,12,1,2,3,4,5,6,7,8,0],
		[14,13,9,10,11,12,1,2,3,4,5,6,7,8,0],
		[8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[9,10,11,12,13,14,15,16,8,0,1,2,3,4,5,6,7],
		[17,9,10,11,12,13,14,15,16,1,2,3,4,5,6,7,8,0],
		[18,17,16,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[16,17,18,19,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[20,16,17,18,19,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[21,20,16,17,18,19,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[22,21,20,16,17,18,19,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[16,17,18,19,20,21,22,23,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[17,18,19,20,21,22,23,24,16,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[25,17,18,19,20,21,22,23,24,16,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[26,25,17,18,19,20,21,22,23,24,16,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[24,25,26,27,16,17,18,19,20,21,22,23,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[28,24,25,26,27,16,17,18,19,20,21,22,23,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[29,28,24,25,26,27,16,17,18,19,20,21,22,23,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
		[30,26,27,28,29,18,19,20,21,22,23,24,25,10,11,12,13,14,15,16,17,2,3,4,5,6,7,8,9,1,0],
		[24,25,26,27,28,29,30,31,16,17,18,19,20,21,22,23,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7],
	];
	constructor(compBuffer: Uint8Array, decompBuffer: Uint8Array) {
		super(compBuffer, decompBuffer);
	}
	process(): boolean {
		let length = 0;
		let opCode = this.compressedByte();
		if ((opCode >> 4) === 2) {
			this.compPos += 2;
			length = this.compressedByte() & 0x07;
		}
		while (this.buffersGood()) {
			if (length === 0) {
				length = 8 + opCode;
				if (length === 0x17) {
					let n = this.compressedByte();
					length += n;
					if (n === 0xff) {
						do {
							n = this.compressedByte() | (this.compressedByte() << 8);
							length += n;
						} while (n === 0xffff);
					}
				}
			}
			while (length !== 0) {
				const n = Math.min(length, decompress21.MaxBlockLength);
				for (const i of decompress21.CopyOrder[n])
					this.decompSet(this.compBuffer[this.compPos + i]);
				this.compPos += n;
				length -= n;
			}
			length = 0;
			opCode = this.compressedByte();
			for (;;) {
				let sourceOffset = 0;
				const op = opCode >> 4;
				switch (op) {
					case 0:
						length = (opCode & 0x0f) + 0x13;
						sourceOffset = this.compressedByte();
						opCode = this.compressedByte();
						length += ((opCode >> 3) & 0x10);
						sourceOffset += ((opCode & 0x78) << 5) + 1;
						break;
					case 1:
						length = (opCode & 0xf) + 3;
						sourceOffset = this.compressedByte();
						opCode = this.compressedByte();
						sourceOffset += ((opCode & 0xf8) << 5) + 1;
						break;
					case 2:
						sourceOffset = this.compressedByte() | (this.compressedByte() << 8);
						length = opCode & 7;
						if ((opCode & 8) === 0) {
							opCode = this.compressedByte();
							length += opCode & 0xf8;
						} else {
							sourceOffset++;
							length += this.compressedByte() << 3;
							opCode = this.compressedByte();
							length += ((opCode & 0xf8) << 8) + 0x100;
						}
						break;
					default:
						length = opCode >> 4;
						sourceOffset = opCode & 15;
						opCode = this.compressedByte();
						sourceOffset += ((opCode & 0xf8) << 1) + 1;
						break;
				}
				if (!this.copy(sourceOffset, length))
					return false;
				length = opCode & 7;
				if (length !== 0)
					break;
				opCode = this.compressedByte();
				if ((opCode >> 4) === 0)
					break;
				if ((opCode >> 4) === 15)
					opCode &= 15;
			}
		}
		return this.buffersGood();
	}
}

async function read21(dwg: DWG, file: FileReader, h0: HeaderBase) {
	class FileHeaderHeader extends bin.Class({
		crc:				R64,
		unknown_key:		R64,
		compressed_crc:		R64,
		compressed_size:	R32,
		uncompressed_size:	R32,
	}) {}

	class FileHeader extends bin.Class({
		header_size:					R64,
		File_size:						R64,
		PagesMapCrcCompressed:			R64,
		PagesMapCorrectionFactor:		R64,
		PagesMapCrcSeed:				R64,
		PagesMap2offset:				R64,
		PagesMap2Id:					R64,
		PagesMapOffset:					R64,
		PagesMapId:						R64,
		Header2offset:					R64,
		PagesMapSizeCompressed:			R64,
		PagesMapSizeUncompressed:		R64,
		PagesAmount:					R64,
		PagesMaxId:						R64,
		Unknown1:						R64,
		Unknown2:						R64,
		PagesMapCrcUncompressed:		R64,
		Unknown3:						R64,
		Unknown4:						R64,
		Unknown5:						R64,
		SectionsAmount:					R64,
		SectionsMapCrcUncompressed:		R64,
		SectionsMapSizeCompressed:		R64,
		SectionsMap2Id:					R64,
		SectionsMapId:					R64,
		SectionsMapSizeUncompressed:	R64,
		SectionsMapCrcCompressed:		R64,
		SectionsMapCorrectionFactor:	R64,
		SectionsMapCrcSeed:				R64,
		StreamVersion:					R64,
		CrcSeed:						R64,
		CrcSeedEncoded:					R64,
		RandomSeed:						R64,
		HeaderCRC64:					R64,
	}) {}

	class PageMapEntry extends bin.Class({
		size:	R64,
		id:		R64,
	}) {}

	class PageMap {
		entries = new Map<number, {page: number, size: number, address: bigint}>;
		constructor(mem: Uint8Array) {
			const	mr = new bin.stream(mem);
			let		address = BigInt(0x480);
			while (mr.remaining()) {
				const e		= new PageMapEntry(mr);
				const page	= Math.abs(Number(e.id));
				this.entries.set(page, {page, size: Number(e.size), address});
				address += e.size;
			}
		}
	}

	class SectionDescription extends bin.Class({
		DataSize:			R64,
		MaxSize:			R64,
		Encryption:			R64,
		HashCode:			R64,
		SectionNameLength:	R64,
		Unknown:			R64,
		Encoding:			R64,
		NumPages:			R64,
		Name:				bin.StringType(s => s.obj.SectionNameLength, 'utf8'),
		pages:				bin.ArrayType(s => s.obj.NumPages, {
			offset:				R64,
			size:				R64,
			id:					R64,
			uncompressed_size:	R64,
			compressed_size:	R64,
			checksum:			R64,
			crc:				R64,
		})
	}) {}

	class SectionPage {
		page: number;
		size: number;
		compressed_size: number;
		offset: bigint;
		address: bigint;

		constructor(p: {offset: bigint, size: bigint, id: bigint, uncompressed_size: bigint, compressed_size: bigint, checksum: bigint, crc: bigint}, page_map: PageMap) {
			this.page		= Number(p.id);
			this.size		= Number(p.size);
			this.compressed_size = Number(p.compressed_size);
			this.offset		= p.offset;
			this.address	= page_map.entries.get(this.page)?.address ?? BigInt(0);
		}
	}

	class Section {
		page_size:	number;
		size:		bigint;
		pages:		SectionPage[];

		constructor(d: SectionDescription, page_map: PageMap) {
			this.page_size	= Number(d.MaxSize);
			this.size		= d.DataSize;
			this.pages 		= d.pages.map(p => new SectionPage(p, page_map));
		}
		async parse(file: FileReader) {
			const out = new Uint8Array(Number(this.size));
			for (const p of this.pages) {
				file.seek(Number(p.address));
				const comp_data		= await file.read_buffer(p.compressed_size);
				const decomp_data	= new Uint8Array(this.page_size);
				const comp			= new decompress21(comp_data, decomp_data);
				if (!comp.process())
					return new Uint8Array();
				const n = Math.min(Number(this.size) - Number(p.offset), this.page_size);
				for (let j = 0; j < n; ++j)
					out[Number(p.offset) + j] = decomp_data[j];
			}
			return out;
		}
	}

	class SectionMap {
		sections = new Map<string, Section>;
		constructor(mem: Uint8Array, page_map: PageMap) {
			const f = new bin.stream(mem);
			while (f.remaining()) {
				const d = new SectionDescription(f);
				this.sections.set(d.Name, new Section(d, page_map));
			}
		}
		async data(file: FileReader, name: string) {
			const s = this.sections.get(name);
			return s ? s.parse(file) : new Uint8Array();
		}
	}

	async function parseSysPage21(file: FileReader, sizeCompressed: number, sizeUncompressed: number, correctionFactor: number, offset: number) {
		const chunks	= Math.floor((((sizeCompressed + 7) / 8 * 8) * correctionFactor + 239 - 1) / 239);
		const fpsize	= chunks * 255;
		file.seek(offset);
		const data		= await file.read_buffer(fpsize);
		const data_rs	= new Uint8Array(fpsize);
		// decodeI logic omitted
		const out		= new Uint8Array(sizeUncompressed);
		const comp		= new decompress21(data_rs, out);
		return comp.process() ? out : null;
	}


	file.seek(0x80);
	const fileHdrRaw = await file.read_buffer(0x2fd);
	// Note: decodeI and related RS decoding is complex; full implementation of Reed-Solomon decoding would be needed
	// For now, using simplified logic that assumes data can be used directly
	const fileHdrRS = new Uint8Array(0x2CD);
	fileHdrRaw.set(fileHdrRS);

	const fhh = new FileHeaderHeader(new bin.stream(fileHdrRS));

	let fh_data: Uint8Array;
	if (fhh.compressed_size < 0) {
		fh_data = new Uint8Array(-fhh.compressed_size);
		// Copy data from after header
		const src = new bin.stream(fileHdrRS);
		src.skip(40);
		src.read_buffer(-fhh.compressed_size);
	} else {
		const out	= new Uint8Array(fhh.uncompressed_size);
		const comp	= new decompress21(fileHdrRS.slice(40), out);
		if (!comp.process())
			return false;
		fh_data = out;
	}

	const fh = new FileHeader(new bin.stream(fh_data));

	// Parse page map
	file.seek(0x480 + Number(fh.PagesMapOffset));
	const pagesData = await parseSysPage21(file, Number(fh.PagesMapSizeCompressed), Number(fh.PagesMapSizeUncompressed), Number(fh.PagesMapCorrectionFactor), 0x480 + Number(fh.PagesMapOffset));
	if (!pagesData)
		return false;

	const page_map = new PageMap(pagesData);

	// Parse section map
	const sectionMapEntry = page_map.entries.get(Number(fh.SectionsMapId));
	if (!sectionMapEntry)
		return false;

	file.seek(Number(sectionMapEntry.address));
	const sectionsData = await parseSysPage21(file, Number(fh.SectionsMapSizeCompressed), Number(fh.SectionsMapSizeUncompressed), Number(fh.SectionsMapCorrectionFactor), Number(sectionMapEntry.address));
	if (!sectionsData)
		return false;

	const section_map = new SectionMap(sectionsData, page_map);

	// Read header
	const header_data = await section_map.data(file, "AcDb:Header");
	check_sentinel(header_data, header_sentinel);
	const ver = h0.version();
	dwg.read_header(new bitsin3(new bitsin2(new bitsin(header_data, ver))));

	// Read classes
	const classes_data = await section_map.data(file, "AcDb:Classes");
	check_sentinel(classes_data, classes_sentinel);
	dwg.read_classes(new bitsin2(new bitsin(classes_data, ver)), classes_data.length * 8);

	// Read handles
	const handles_data = await section_map.data(file, "AcDb:Handles");
	dwg.read_handles(new bin.stream(handles_data));

	// Read objects/tables
	const objects_data = await section_map.data(file, "AcDb:AcDbObjects");
	dwg.read_tables(new bin.stream(objects_data));

	return true;
}
import { VER, ASyncReader } from './core';
import * as bin from '@isopodlabs/binary';
import { decodeI } from './reed_solomon';
import {CRC16} from './crc16';
import fs from 'fs/promises';

abstract class ASyncReaderBase implements ASyncReader {
	constructor(public size: bigint) {}
	abstract read_buffer(offset: bigint, len: number) : Promise<Buffer>;
	all() { return this.read_buffer(0n, Number(this.size)); }
}

class FileReader extends ASyncReaderBase {
	constructor(public fd: fs.FileHandle, public size: bigint) {
		super(size);
	}

	static async create(filename: string) {
		const stats = await fs.stat(filename, {bigint: true});
		return new FileReader(await fs.open(filename, 'r'), stats.size);
	}

	async read_buffer(offset: bigint, len: number) {
		const buffer = Buffer.alloc(len);
		const {bytesRead} =  await this.fd.read(buffer, 0, len, offset);
		return buffer;
	}
}

const U8	= bin.UINT8;
const U16	= bin.UINT16;
const U32	= bin.UINT32;
const U64	= bin.UINT64;
const S32	= bin.INT32;


class HeaderBase extends bin.Class({
	ver:			bin.StringType(11),
	maint_ver:		bin.UINT8,
	one:			bin.UINT8,
	image_seeker:	bin.UINT32,		//0x0d
	app_ver:		bin.UINT8,		//0x11
	app_maint_ver:	bin.UINT8,		//0x12
	codepage:		bin.UINT16,		//0x13
	extra:			bin.Remainder,	//0x15
}) {
	constructor(public raw: Buffer) {
		super(new bin.stream(raw));
	}
	version(): VER {
		return VER.FromInt(parseInt(this.ver.slice(2)));
	}
	valid(): VER {
		return this.ver.startsWith('AC') ? this.version() : VER.BAD;
	}
}

export interface DWGReader {
	version: VER;
	reader(name: string): ASyncReader | undefined;
}

export async function openDWG(filename: string) : Promise<DWGReader | undefined> {
	try {
		const file	= await FileReader.create(filename);
		const head	= new HeaderBase(await file.read_buffer(0n, 128));
		switch (head.valid()) {
			case VER.R13:
			case VER.R14:
			case VER.R2000:
				return read12(file, head);
			case VER.R2007:
				return read21(file, head);
			case VER.R2004:
			case VER.R2010:
			case VER.R2013:
			case VER.R2018:
				return read18(file, head);
			default:
				return undefined;
		}

	} catch (_e) {
		return undefined;
	}
}

//-----------------------------------------------------------------------------
// DWG readers
//-----------------------------------------------------------------------------

const fileheader_sentinel	= new Uint8Array([0x95, 0xA0, 0x4E, 0x28, 0x99, 0x82, 0x1A, 0xE5, 0x5E, 0x41, 0xE0, 0x5F, 0x9D, 0x3A, 0x4D, 0x00]);
//const header_sentinel		= new Uint8Array([0xCF, 0x7B, 0x1F, 0x23, 0xFD, 0xDE, 0x38, 0xA9, 0x5F, 0x7C, 0x68, 0xB8, 0x4E, 0x6D, 0x33, 0x5F]);
//const header_sentinel_end	= new Uint8Array([0x30, 0x84, 0xE0, 0xDC, 0x02, 0x21, 0xC7, 0x56, 0xA0, 0x83, 0x97, 0x47, 0xB1, 0x92, 0xCC, 0xA0]);
//const classes_sentinel		= new Uint8Array([0x8D, 0xA1, 0xC4, 0xB8, 0xC4, 0xA9, 0xF8, 0xC5, 0xC0, 0xDC, 0xF4, 0x5F, 0xE7, 0xCF, 0xB6, 0x8A]);
//const classes_sentinel_end	= new Uint8Array([0x72, 0x5E, 0x3B, 0x47, 0x3B, 0x56, 0x07, 0x3A, 0x3F, 0x23, 0x0B, 0xA0, 0x18, 0x30, 0x49, 0x75]);

function check_sentinel(data: Uint8Array | undefined, sentinel: Uint8Array): data is Uint8Array {
	if (!data)
		return false;
	for (let i = 0; i < sentinel.length; i++) {
		if (data[i] !== sentinel[i])
			return false;
	}
	return true;
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

async function read12(file: FileReader, h0: HeaderBase) {
	const HEADER = 0, CLASSES = 1, HANDLES = 2, UNKNOWNS = 3, TEMPLATE = 4, AUXHEADER = 5;

	class Section extends bin.Class({
		id:			U8,
		address:	U32,
		size:		U32,
	}) {
		reader() {
			const base = BigInt(this.address);
			const clss = class extends ASyncReaderBase {
				async read_buffer(offset: bigint, len: number) {
					return file.read_buffer(base + offset, len);
				}
			};
			return new clss(BigInt(this.size));
		}
		/*
		async rawData() {
			return file.read_buffer(BigInt(this.address), this.size);
		}
		async checkedData(sentinel: Uint8Array) {
			const data = file.read_buffer(BigInt(this.address), this.size);
			const s		= new bin.stream(await data);
			const start	= bin.read(s, {sentinel: bin.Buffer(16), size: U32});
			if (check_sentinel(start.sentinel, sentinel))
				return s.read_buffer(start.size);
		}*/
	}

	const mr = new bin.stream(h0.extra);
	const sections = bin.ArrayType(U32, Section).get(mr);

	// Calculate and verify CRC16
	const pos 	= mr.tell();
	const crc	= U16.get(mr);
	const crc16	= new CRC16();
	crc16.updateBuffer(h0.raw.subarray(0, pos));
	let ckcrc = crc16.getValue();

	switch (sections.length) {
		case 3:		ckcrc ^= 0xA598; break;
		case 4:		ckcrc ^= 0x8101; break;
		case 5:		ckcrc ^= 0x3CC4; break;
		case 6:		ckcrc ^= 0x8461;
	}

	if (crc !== (ckcrc & 0xffff))
		throw new Error("CRC mismatch");
	
	if (!check_sentinel(mr.read_buffer(16), fileheader_sentinel))
		return;

	return {
		version: h0.version(),
		reader(name: string): ASyncReader | undefined {
			switch (name) {
				case "AcDb:Header":			return sections[HEADER].reader();
				case "AcDb:Classes":		return sections[CLASSES].reader();
				case "AcDb:Handles":		return sections[HANDLES].reader();
				case "AcDb:AcDbObjects":	return file;
			}
		}
	};


/*
	// Read header
	const headerData	= await sections[HEADER].checkedData(header_sentinel);
	if (!headerData)
		return;

	// Read classes
	const classesData = await sections[CLASSES].checkedData(classes_sentinel);
	if (!classesData)
		return;

	const handlesData = await sections[HANDLES].rawData();
	if (!handlesData)
		return;

	const version = h0.version();
	return {
		version,
		vars: new HeaderVars(new bitsin3(new bitsin2(new bitsin(headerData, version)))),
		get_object: get_object(file, version,
			read_classes(new bitsin2(new bitsin(classesData, version)), (classesData.length - 1) * 8),
			read_handles(new bin.stream(handlesData))
		)
	};
*/
}


//-----------------------------------------------------------------------------
// R2004/R2010/R2013/R2018 format reader
//-----------------------------------------------------------------------------

class decompress18 extends decompress_dwg {
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

async function read18(file: FileReader, h0: HeaderBase) {
	const SectionTypes = {
		SYS_SECTION:	0x41630e3b,
		DATA_SECTION:	0x4163043b,
		MAP_SECTION:	0x4163003b,
	};
	type SectionType = keyof typeof SectionTypes;

	const DataSectionSpec = {
		page_type: 			U32,
		section: 			U32,
		compressed_size: 	U32,
		decompressed_size: 	U32,
		offset: 			U32,
		header_checksum: 	U32,
		data_checksum: 		U32,
		unknown: 			U32,
	};
	const SystemPageSpec = {
		page_type: 			U32,
		decompressed_size:  U32,
		compressed_size:  	U32,
		compression_type:  	U32,
		header_checksum:  	U32,
	};

	const FileHeaderSpec = {
		id:					bin.StringType(12),	//0x00 12	�AcFssFcAJMB� file ID string
		_0:					U32,				//0x0C 4	0x00 (long)
		_6c:				U32,				//0x10 4	0x6c (long)
		_4:					U32,				//0x14 4	0x04 (long)
		root_gap:			U32,				//0x18 4	Root tree node gap
		lower_left_gap:		U32,				//0x1C 4	Lowermost left tree node gap
		lower_right_gap:	U32,				//0x20 4	Lowermost right tree node gap
		_1:					U32,				//0x24 4	Unknown long (ODA writes 1)
		last_section_page:	U32,				//0x28 4	Last section page Id
		last_section_page_end:	U64,			//0x2C 8	Last section page end address
		second_header:			U64,			//0x34 8	Second header data address pointing to the repeated header data at the end of the file
		gap:				U32,				//0x3C 4	Gap amount
		section_page:		U32,				//0x40 4	Section page amount
		_20:				U32,				//0x44 4	0x20 (long)
		_80:				U32,				//0x48 4	0x80 (long)
		_40:				U32,				//0x4C 4	0x40 (long)
		section_page_map:	U32,				//0x50 4	Section Page Map Id
		section_page_map_addr:	U64,			//0x54 8	Section Page Map address (add 0x100 to this value)
		section_map:		U32,				//0x5C 4	Section Map Id
		section_page_array:	U32,				//0x60 4	Section page array size
		gap_array:			U32,				//0x64 4	Gap array size
		crc32:				U32,				//0x68 4	CRC32 (long) CRC calculation is done including the 4 CRC bytes that are initially zero
		magic:				bin.Buffer(20)		//0x6c 20
	};
	const magic	= new Uint8Array([
		0x41, 0x34, 0xf7, 0x4d, 0xba, 0xf3, 0x70, 0x1c, 0x8f, 0xfa, 0x8e, 0xe8, 0x66, 0x1d, 0x83, 0x86, 0x83, 0xe8, 0x0f, 0xa0
	]);


	async function SystemPage(address: bigint, type: SectionType) {
		const r		= bin.read(new bin.stream(await file.read_buffer(address, 20)), SystemPageSpec);
		if (r.page_type === SectionTypes[type]) {
			const out	= Buffer.alloc(r.decompressed_size);
			const comp	= new decompress18(await file.read_buffer(address + 20n, r.compressed_size), out);
			if (comp.process())
				return out;
		}
	}

	async function DataSection(address: bigint) {
		const raw = await file.read_buffer(address, 32);

		const u32 = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
		const x = Number(address & 0xffffffffn) ^ 0x4164536b;
		for (let i = 0; i < u32.length; ++i)
			u32[i] ^= x;

		const r		= bin.read(new bin.stream(raw), DataSectionSpec);
		const out	= Buffer.alloc(r.decompressed_size);
		const comp	= new decompress18(await file.read_buffer(address + 32n, r.compressed_size), out);
		if (comp.process())
			return out;
	}

	class PageMap {
		entries = new Map<number, {size: number, address: bigint}>;

		constructor(mem: Uint8Array) {
			const file = new bin.stream(mem);
			let address = 0x100n;
			while (file.remaining()) {
				const page = U32.get(file);
				const size = U32.get(file);
				if (page < 0)
					file.skip(4 * 4);
				else
					this.entries.set(page, {size, address});
				address += BigInt(size);
			}
		}
		lookup(page: number) {
			return this.entries.get(page)?.address ?? 0n;
		}
	}

	class Page extends bin.Class({
		page:				U32,
		size:				U32,
		offset:				U64,
	}) {
		cached?: WeakRef<Buffer>;

		async data(): Promise<Uint8Array | undefined> {
			if (this.cached)
				return this.cached.deref();

			const out = await DataSection(page_map.lookup(this.page));
			if (out)
				this.cached = new WeakRef(out);
			return out;
		}
	}

	class Section extends bin.Class({
		size:				U64,
		PageCount:			U32,
		page_size:			U32,
		unknown:			U32,
		compression_type:	U32,
		section_id:			U32,
		encrypted:			U32,
		name:				bin.StringType(64, 'utf8', true),
		pages:				bin.ArrayType(s => s.obj.PageCount, Page),
	}) {
		reader() {
			const page_size	= this.page_size;
			const pages	= this.pages;
			const clss	= class extends ASyncReaderBase {
				async read_buffer(offset: bigint, len: number) {
					let page	= Number(offset / BigInt(page_size));
					let data	= await pages[page].data();
					if (!data)
						return Buffer.alloc(0);

					const off	= Number(offset % BigInt(page_size));
					let result	= Buffer.from(data).subarray(off, off + len);
					while (result.length < len && (data = await pages[++page].data()))
						result = Buffer.concat([result, data.subarray(0, len - result.length)]);
					return result;
				}
			};
			return new clss(this.size);
		}
	}

	class SectionMap extends bin.Class({
		NumDescriptions:		U32,
		_0x02:					U32,
		MaxDecompressedSize:	U32,	// max size of any page
		_0x00:					U32,
		NumDescriptions2:		U32,
		sections:				bin.ArrayType(s => s.obj.NumDescriptions, Section),
	})  implements DWGReader {
		version	= h0.version();

		constructor(mem: Uint8Array) {
			super(new bin.stream(mem));
		}
		reader(name: string) {
			const section = this.sections.find(i => i.name === name);
			if (section)
				return section.reader();
		}
	}
/*
	const	h	= bin.read(new bin.stream(h0.extra), {
		padding:		bin.Buffer(3),	//0x15
		security:		U32,	//0x18
		unknown:		U32,
		summary:		U32,
		vba_project:	U32,
		_0x80:			U32,
		//uint8	padding2[0x54];
	});
*/
	const	temp = await file.read_buffer(0x80n, 0x80);
	for (let i = 0, seed = 1; i < temp.length; i++) {
		seed = ((seed * 0x343fd) + 0x269ec3) & 0xffffffff;
		temp[i] ^= seed >> 16;
	}
	const	fh	= bin.read(new bin.stream(temp), FileHeaderSpec);
	if (!fh.magic.reduce((a, v, i) => a && v === magic[i], true))
		return undefined;

	const map_data	= await SystemPage(fh.section_page_map_addr + 0x100n, 'SYS_SECTION');
	if (!map_data)
		return undefined;

	const page_map = new PageMap(map_data);

	// Get section map
	const map_section_entry = page_map.entries.get(fh.section_map);
//	const map_section_entry = page_map.entries.values().next().value;
	if (!map_section_entry)
		return undefined;

	const sections_data	= await SystemPage(map_section_entry.address, 'MAP_SECTION');
	if (!sections_data)
		return undefined;

	return new SectionMap(sections_data);
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

async function read21(file: FileReader, h0: HeaderBase) {
	const FileHeaderHeaderSpec = {
		crc:							U64,
		unknown_key:					U64,
		compressed_crc:					U64,
		compressed_size:				S32,
		uncompressed_size:				U32,
	};

	const FileHeaderSpec = {
		header_size:					U64,
		File_size:						U64,
		PagesMapCrcCompressed:			U64,
		PagesMapCorrectionFactor:		U64,
		PagesMapCrcSeed:				U64,
		PagesMap2offset:				U64,
		PagesMap2Id:					U64,
		PagesMapOffset:					U64,
		PagesMapId:						U64,
		Header2offset:					U64,
		PagesMapSizeCompressed:			U64,
		PagesMapSizeUncompressed:		U64,
		PagesAmount:					U64,
		PagesMaxId:						U64,
		Unknown1:						U64,
		Unknown2:						U64,
		PagesMapCrcUncompressed:		U64,
		Unknown3:						U64,
		Unknown4:						U64,
		Unknown5:						U64,
		SectionsAmount:					U64,
		SectionsMapCrcUncompressed:		U64,
		SectionsMapSizeCompressed:		U64,
		SectionsMap2Id:					U64,
		SectionsMapId:					U64,
		SectionsMapSizeUncompressed:	U64,
		SectionsMapCrcCompressed:		U64,
		SectionsMapCorrectionFactor:	U64,
		SectionsMapCrcSeed:				U64,
		StreamVersion:					U64,
		CrcSeed:						U64,
		CrcSeedEncoded:					U64,
		RandomSeed:						U64,
		HeaderCRC64:					U64,
	};

	class PageMap {
		entries = new Map<number, {page: number, size: number, address: bigint}>;
		constructor(mem: Uint8Array) {
			const PageMapEntry = {
				size:		U64,
				id:			U64,
			};
			const	mr = new bin.stream(mem);
			let		address = BigInt(0x480);
			while (mr.remaining()) {
				const e		= bin.read(mr, PageMapEntry);
				const page	= Math.abs(Number(e.id));
				this.entries.set(page, {page, size: Number(e.size), address});
				address += e.size;
			}
		}
		lookup(page: number) {
			return this.entries.get(page)?.address ?? BigInt(0);
		}
	}

	class Page extends bin.Class({
		offset:				U64,
		size:				U64,
		id:					U64,
		uncompressed_size:	U64,
		compressed_size:	U64,
		checksum:			U64,
		crc:				U64,
	}) {
		cached?: WeakRef<Buffer>;

		async data() {
			if (this.cached)
				return this.cached.deref();

			const data		= await file.read_buffer(page_map.lookup(Number(this.id)), Number(this.compressed_size));
			const data_rs	= new Uint8Array(Number(this.compressed_size));
			decodeI(251, 0xb8, 8, 2, data, data_rs, Number(this.compressed_size / 255n));

			const out		= Buffer.alloc(Number(this.uncompressed_size));
			const comp		= new decompress21(data_rs, out);
			if (comp.process()) {
				this.cached = new WeakRef(out);
				return out;
			}
		}
	}

	class Section extends bin.Class({
		DataSize:			U64,
		MaxSize:			U64,
		Encryption:			U64,
		HashCode:			U64,
		SectionNameLength:	U64,
		Unknown:			U64,
		Encoding:			U64,
		NumPages:			U64,
		Name:				bin.StringType(s => s.obj.SectionNameLength, 'utf8'),
		pages:				bin.ArrayType(s => s.obj.NumPages, Page),
	}) {/*
		async data() {
			const out = new Uint8Array(Number(this.DataSize));
			await Promise.all(this.pages.map(p => p.data().then(data => {
				if (data)
					data.subarray(0, Math.min(Number(this.DataSize - p.offset), data.length)).set(out, Number(p.offset));
			})));
			return out;
		}*/
		reader() {
			const page_size = this.MaxSize;
			const pages = this.pages;

			function page_data(page: bigint) {
				const p = pages.find(p => p.id === page);
				return p ? p.data() : Promise.resolve(undefined);
			}

			const clss = class extends ASyncReaderBase {
				async read_buffer(offset: bigint, len: number): Promise<Buffer> {
					let page	= offset / page_size;
					let data	= await page_data(page);
					if (!data)
						return Buffer.alloc(0);

					const off	= Number(offset % page_size);
					let result	= data.subarray(off, off + len);
					while (result.length < len && (data = await page_data(++page)))
						result = Buffer.concat([result, data.subarray(0, len - result.length)]);
					return result;
				}
			};
			return new clss(this.DataSize);
		}
	}

	class SectionMap implements DWGReader {
		version = h0.version();
		sections = new Map<string, Section>;
		constructor(mem: Uint8Array) {
			const f = new bin.stream(mem);
			while (f.remaining()) {
				const d = new Section(f);
				this.sections.set(d.Name, d);
			}
		}/*
		async data(name: string) {
			const s = this.sections.get(name);
			return s ? s.data() : Buffer.alloc(0);
		}*/
		reader(name: string) {
			const section = this.sections.get(name);
			if (section)
				return section.reader();
		}
	}

	async function SysPage(loc: bigint, sizeCompressed: number, sizeUncompressed: number, correctionFactor: number) {
		const chunks	= Math.floor((((sizeCompressed + 7) / 8 * 8) * correctionFactor + 239 - 1) / 239);
		const fpsize	= chunks * 255;
		const data		= await file.read_buffer(loc, fpsize);
		const data_rs	= new Uint8Array(fpsize);
		decodeI(239, 0x96, 8, 8, data, data_rs, chunks);

		const out		= new Uint8Array(sizeUncompressed);
		const comp		= new decompress21(data_rs, out);
		return comp.process() ? out : null;
	}


	const fileHdrRS		= new Uint8Array(0x2CD);
	decodeI(239, 0x96, 8, 8, await file.read_buffer(0x80n, 0x2fd), fileHdrRS, 3);

	const fhh = bin.read(new bin.stream(fileHdrRS), FileHeaderHeaderSpec);

	let fh_data: Uint8Array;
	if (fhh.compressed_size < 0) {
		fh_data = fileHdrRS.subarray(40, 40 - fhh.compressed_size);
	} else {
		fh_data	= new Uint8Array(fhh.uncompressed_size);
		const comp	= new decompress21(fileHdrRS.subarray(40), fh_data);
		if (!comp.process())
			return undefined;
	}

	const fh = bin.read(new bin.stream(fh_data), FileHeaderSpec);

	// Parse page map
	const pagesData = await SysPage(0x480n + fh.PagesMapOffset, Number(fh.PagesMapSizeCompressed), Number(fh.PagesMapSizeUncompressed), Number(fh.PagesMapCorrectionFactor));
	if (!pagesData)
		return undefined;

	const page_map = new PageMap(pagesData);

	// Parse section map
	const sectionMapAddr = page_map.lookup(Number(fh.SectionsMapId));
	if (!sectionMapAddr)
		return undefined;

	const sectionsData = await SysPage(sectionMapAddr, Number(fh.SectionsMapSizeCompressed), Number(fh.SectionsMapSizeUncompressed), Number(fh.SectionsMapCorrectionFactor));
	if (!sectionsData)
		return undefined;

	return new SectionMap(sectionsData);
	/*
	const section_map = new SectionMap(sectionsData);

	// Read header
	const header_data = await section_map.data("AcDb:Header");
	if (!check_sentinel(header_data, header_sentinel))
		return;
	
	const classes_data = await section_map.data("AcDb:Classes");
	if (!check_sentinel(classes_data, classes_sentinel))
		return;

	const handles_data = await section_map.data("AcDb:Handles");
	if (!handles_data)
		return;

	const objects = section_map.reader("AcDb:AcDbObjects");
	if (!objects)
		return;

	const version = h0.version();
	return {
		version,
		vars: new HeaderVars(new bitsin3(new bitsin2(new bitsin(header_data, version)))),
		get_object: get_object(objects, version,
			read_classes(new bitsin2(new bitsin(classes_data, version)), classes_data.length * 8),
			read_handles(new bin.stream(handles_data))
		)
	};
	*/
}
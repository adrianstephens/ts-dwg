//-----------------------------------------------------------------------------
// reed-solomon error correction
//-----------------------------------------------------------------------------

export class RScodec {
//	private mm: number; // RS code over GF(2^mm)
//	private tt: number; // number of errors that can be corrected
	private nn: number; // (2^mm) - 1, length of codeword
	private kk: number; // nn - 2*tt, length of original data
	private isOk        = false;
	private alpha_to:   Int32Array;
	private index_of:   Int32Array;
	private gg:         Int32Array;

	// pp: irreducible polynomial coeffs
	constructor(pp: number, private mm: number, private tt: number) {
		this.nn         = (1 << mm) - 1;
		this.kk         = this.nn - tt * 2;
		this.alpha_to   = new Int32Array(this.nn + 1);
		this.index_of   = new Int32Array(this.nn + 1);
		this.gg         = new Int32Array(this.nn - this.kk + 1);

		this.generate_gf(pp);
		this.isOk = this.generate_poly();
	}

	private generate_gf(pp: number): void {
		let mask = 1;
		this.alpha_to[this.mm] = 0;

		for (let i = 0; i < this.mm; i++) {
			this.alpha_to[i] = mask;
			this.index_of[mask] = i;
			if (((pp >> (this.mm - 1 - i)) & 1) !== 0)
				this.alpha_to[this.mm] ^= mask;
			mask <<= 1;
		}

		this.index_of[this.alpha_to[this.mm]] = this.mm;
		mask >>= 1;
		for (let i = this.mm + 1; i < this.nn; i++) {
			this.alpha_to[i] =
				this.alpha_to[i - 1] >= mask
					? this.alpha_to[this.mm] ^ ((this.alpha_to[i - 1] ^ mask) << 1)
					: this.alpha_to[i - 1] << 1;
			this.index_of[this.alpha_to[i]] = i;
		}
		this.index_of[0] = -1;
	}

	private generate_poly(): boolean {
		this.gg[0] = 2; // primitive element alpha = 2 for GF(2**mm)
		this.gg[1] = 1; // g(x) = (X+alpha) initially
		const bb = this.nn - this.kk; // length of parity data

		for (let i = 2; i <= bb; i++) {
			this.gg[i] = 1;
			for (let j = i; j--; ) {
				if (this.gg[j] < 0)
					return false;

				if (this.gg[j] === 0) {
					this.gg[j] = this.gg[j - 1];
				} else {
					const tmp = (this.index_of[this.gg[j]] + i) % this.nn;
					if (tmp < 0)
						return false;
					this.gg[j] = this.gg[j - 1] ^ this.alpha_to[tmp];
				}
			}
			this.gg[0] = this.alpha_to[(this.index_of[this.gg[0]] + i) % this.nn]; // gg[0] can never be zero
		}

		// convert gg[] to index form for quicker encoding
		for (let i = 0; i <= bb; i++)
			this.gg[i] = this.index_of[this.gg[i]];

		return true;
	}

	encode(data: Uint8Array, parity: Uint8Array): boolean {
		if (!this.isOk)
			return false;

		const bb = this.nn - this.kk; // length of parity data
		for (let i = 0; i < bb; i++)
			parity[i] = 0;

		for (let i = this.kk - 1; i >= 0; i--) {
			const feedback = this.index_of[data[i] ^ parity[bb - 1]];
			if (feedback !== -1) {
				for (let j = bb - 1; j > 0; j--)
					parity[j] = parity[j - 1] ^ (this.gg[j] === -1 ? 0 : this.alpha_to[(this.gg[j] + feedback) % this.nn]);
				parity[0] = this.alpha_to[(this.gg[0] + feedback) % this.nn];
			} else {
				for (let j = bb - 1; j > 0; j--)
					parity[j] = parity[j - 1];
				parity[0] = 0;
			}
		}
		return true;
	}

	decode(data: Uint8Array): number {
		if (!this.isOk)
			return -1;

		const bb    = this.nn - this.kk; // length of parity data
		const recd  = new Int32Array(this.nn);
		const s     = new Int32Array(bb + 1);

		for (let i = 0, j = bb; i < this.kk; i++, j++)
			recd[j] = this.index_of[data[j]]; // put data in recd[i] into index form

		for (let i = this.kk, j = 0; i < this.nn; i++, j++)
			recd[j] = this.index_of[data[j]]; // put data in recd[i] into index form

		// first form the syndromes
		let syn_error = false;
		for (let i = 1; i <= bb; i++) {
			s[i] = 0;
			for (let j = 0; j < this.nn; j++) {
				if (recd[j] !== -1)
					s[i] ^= this.alpha_to[(recd[j] + i * j) % this.nn]; // recd[j] in index form
			}
			// convert syndrome from polynomial form to index form
			if (s[i] !== 0)
				syn_error = true; // set flag if non-zero syndrome => error
			s[i] = this.index_of[s[i]];
		}

		if (!syn_error)
			// no non-zero syndromes => no errors: output is received codeword
			return 0;

		// errors are present, try and correct
		const elp: Int32Array[] = [];
		for (let i = 0; i < bb + 2; i++)
			elp[i] = new Int32Array(bb);

		const d		= new Int32Array(bb + 2);
		const l		= new Int32Array(bb + 2);
		const u_lu	= new Int32Array(bb + 2);
		const root	= new Int32Array(this.tt);
		const loc	= new Int32Array(this.tt);
		const z		= new Int32Array(this.tt + 1);
		const err	= new Int32Array(this.nn);
		const reg	= new Int32Array(this.tt + 1);

		// initialise table entries
		d[0] = 0; // index form
		d[1] = s[1]; // index form
		elp[0][0] = 0; // index form
		elp[1][0] = 1; // polynomial form
		for (let i = 1; i < bb; i++) {
			elp[0][i] = -1; // index form
			elp[1][i] = 0; // polynomial form
		}
		l[0] = 0;
		l[1] = 0;
		u_lu[0] = -1;
		u_lu[1] = 0;

		let u = 0;

		do {
			u++;
			if (d[u] === -1) {
				l[u + 1] = l[u];
				for (let i = 0; i <= l[u]; i++) {
					elp[u + 1][i] = elp[u][i];
					elp[u][i] = this.index_of[elp[u][i]];
				}
			} else {
				// search for words with greatest u_lu[q] for which d[q]!=0
				let q = u - 1;
				while (q > 0 && d[q] === -1)
					--q;

				// have found first non-zero d[q]
				if (q > 0) {
					let j = q;
					do {
						--j;
						if (d[j] !== -1 && u_lu[q] < u_lu[j])
							q = j;
					} while (j > 0);
				}

				// have now found q such that d[u] != 0 and u_lu[q] is maximum store degree of new elp polynomial
				l[u + 1] = Math.max(l[u], l[q] + u - q);

				// form new elp(x)
				for (let i = 0; i < bb; i++)
					elp[u + 1][i] = 0;

				for (let i = 0; i <= l[q]; i++) {
					if (elp[q][i] !== -1)
						elp[u + 1][i + u - q] = this.alpha_to[(d[u] + this.nn - d[q] + elp[q][i]) % this.nn];
				}
				for (let i = 0; i <= l[u]; i++) {
					elp[u + 1][i] ^= elp[u][i];
					elp[u][i] = this.index_of[elp[u][i]]; // convert old elp value to index
				}
			}
			u_lu[u + 1] = u - l[u + 1];

			// form (u+1)th discrepancy
			if (u < bb) {
				// no discrepancy computed on last iteration
				d[u + 1] = s[u + 1] !== -1 ? this.alpha_to[s[u + 1]] : 0;

				for (let i = 1; i <= l[u + 1]; i++) {
					if (s[u + 1 - i] !== -1 && elp[u + 1][i] !== 0)
						d[u + 1] ^= this.alpha_to[(s[u + 1 - i] + this.index_of[elp[u + 1][i]]) % this.nn];
				}
				d[u + 1] = this.index_of[d[u + 1]]; // put d[u+1] into index form
			}
		} while (u < bb && l[u + 1] <= this.tt);

		++u;
		if (l[u] > this.tt)
			// elp has degree >tt hence cannot solve
			return -1;

		// correct the error:
		// put elp into index form
		for (let i = 0; i <= l[u]; i++)
			elp[u][i] = this.index_of[elp[u][i]];

		// find roots of the error location polynomial
		for (let i = 1; i <= l[u]; i++)
			reg[i] = elp[u][i];

		let count = 0;
		for (let i = 1; i <= this.nn; i++) {
			let q = 1;
			for (let j = 1; j <= l[u]; j++) {
				if (reg[j] !== -1) {
					reg[j] = (reg[j] + j) % this.nn;
					q ^= this.alpha_to[reg[j]];
				}
			}
			if (!q) {
				// store root and error location number indices
				root[count] = i;
				loc[count] = this.nn - i;
				count++;
			}
		}

		if (count !== l[u])
			// no. roots != degree of elp => >tt errors and cannot solve
			return -1;

		// no. roots = degree of elp hence <= tt errors

		// form polynomial z(x)
		for (let i = 1; i <= l[u]; i++) {
			// Z[0] = 1 always - do not need
			z[i] = (s[i] === -1 ? 0 : this.alpha_to[s[i]]) ^ (elp[u][i] === -1 ? 0 : this.alpha_to[elp[u][i]]);

			for (let j = 1; j < i; j++) {
				if (s[j] !== -1 && elp[u][i - j] !== -1)
					z[i] ^= this.alpha_to[(elp[u][i - j] + s[j]) % this.nn];
			}
			z[i] = this.index_of[z[i]]; // put into index form
		}

		// evaluate errors at locations given by error location numbers loc[i]
		for (let i = 0; i < this.nn; i++)
			err[i] = 0;

		// compute numerator of error term first
		for (let i = 0; i < l[u]; i++) {
			err[loc[i]] = 1; // accounts for z[0]
			for (let j = 1; j <= l[u]; j++) {
				if (z[j] !== -1)
					err[loc[i]] ^= this.alpha_to[(z[j] + j * root[i]) % this.nn];
			}
			if (err[loc[i]] !== 0) {
				err[loc[i]] = this.index_of[err[loc[i]]];
				let q = 0; // form denominator of error term
				for (let j = 0; j < l[u]; j++) {
					if (j !== i)
						q += this.index_of[1 ^ this.alpha_to[(loc[j] + root[i]) % this.nn]];
				}
				q = q % this.nn;
				err[loc[i]] = this.alpha_to[(err[loc[i]] - q + this.nn) % this.nn];
				data[loc[i]] ^= err[loc[i]]; // change errors by correct data, in polynomial form
			}
		}
		return count;
	}
}

// Decode function for blocks of data
// N	length of output block
// P	polynomial
// M	length of codeword = (2^M) - 1
// T	number of errors that can be corrected
// in	input data (at least 255 * blk bytes)
// out	output data (at least N * blk bytes)
// blk	number of codewords
export function decodeI(
	N: number,
	P: number,
	M: number,
	T: number,
	input: Uint8Array,
	output: Uint8Array,
	blk: number
): void {
	const data  = new Uint8Array((1 << M) - 1);
	const rsc   = new RScodec(P, M, T);

	for (let i = 0; i < blk; i++) {
		for (let j = 0, k = i; j < data.length; j++) {
			data[j] = input[k];
			k += blk;
		}
		const r = rsc.decode(data);
		//if (r < 0)
		//	console.warn("\nWARNING: decodeI, can't correct all errors");
		output.set(data.subarray(0, output.length - i * N), i * N);
	}
}

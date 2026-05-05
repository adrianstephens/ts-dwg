
import {DWG} from '../dist/index';

(async() => {
	// Load a font file
	//const dwg = new DWG('/Volumes/DevSSD/dev/github/libredwg/test/test-data/2000/Arc.dwg');
	//const dwg = new DWG('/Volumes/DevSSD/dev/github/libredwg/test/test-data/2004/Arc.dwg');
	const dwg = new DWG('/Volumes/DevSSD/dev/github/libredwg/test/test-data/2007/Arc.dwg');
	await dwg.ready!;
})();

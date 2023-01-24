import * as path from 'path';

export function nameByHeader(data: any) {
	return data.header?.path?.substring?.(
		0,
		data.header.path.length - path.extname(data.header.path).length
	).concat('.html');
}

export default nameByHeader;

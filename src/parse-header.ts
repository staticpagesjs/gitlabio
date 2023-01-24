import * as path from 'path';
import { Gitlab } from '@gitbeaker/node';

import { reader } from './reader.js';

type Data<T> = {
	header: {
		latestCommit: {
			hash: string;
			abbrev: string;
			authorName: string;
			authorEmail: string;
			authoredDate?: string;
			committerName?: string;
			committerEmail?: string;
			committedDate?: string;
			message: string;
			// changes: {
			// 	status: string,
			// 	path: string,
			// 	srcPath?: string,
			// 	similarity?: number,
			// }[];
		};
		host: string;
		repository: string;
		branch: string;
		cwd: string;
		path: string;
		dirname: string;
		basename: string;
		extname: string;
	};
} & T;

const commits = new WeakMap<object, Data<object>['header']['latestCommit']>();
const getCommit = async (opts: Required<reader.Options<Data<any>, Record<string, unknown>>>) => {
	if (!commits.has(opts)) {
		const gitlab = new Gitlab(opts);
		const gc = await gitlab.Commits.show(opts.repository, opts.branch);
		const commit = {
			hash: gc.id,
			abbrev: gc.short_id,
			authorName: gc.author_name,
			authorEmail: gc.author_email,
			authoredDate: gc.authored_date?.toJSON(),
			committerName: gc.committer_name || gc.author_name,
			committerEmail: gc.committer_email || gc.author_email,
			committedDate: gc.committed_date?.toJSON() || gc.authored_date?.toJSON(),
			message: gc.message,
		};
		commits.set(opts, commit);
	}
	// @ts-ignore
	return commits.get(opts);
};

/**
 * Creates a `header` property containing segments of the file full path.
 */
export function parseHeader(): {
	(body: Buffer, file: string, options: reader.Options<Record<string, unknown>, {}>): Promise<Data<{ body: Buffer; }>>;
};

/**
 * Creates a `header` property containing segments of the file full path.
 */
export function parseHeader<R extends Record<string, unknown>>(bodyParser: { (body: Buffer, file: string, options: reader.Options<Data<R>, Record<string, unknown>>): R | Promise<R>; }): {
	(body: Buffer, file: string, options: reader.Options<Data<R>, Record<string, unknown>>): Promise<Data<R>>;
};

/**
 * Creates a `header` property containing segments of the file full path.
 */
export function parseHeader(bodyParser: { (body: any, file: string, options: any): any | Promise<any>; } = body => ({ body })) {
	return async (body: Buffer, file: string, options: any) => {
		const extName = path.extname(file);
		const { header, ...payload } = await (bodyParser(body, file, options) as Promise<any>);
		return {
			header: {
				host: options.host,
				repository: options.repository,
				branch: options.branch,
				cwd: options.cwd,
				latestCommit: await getCommit(options),
				path: file,
				dirname: path.dirname(file),
				basename: path.basename(file, extName),
				extname: extName
			},
			...payload
		};
	};
}

export default parseHeader;

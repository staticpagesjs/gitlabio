import * as path from 'path/posix';
import { Gitlab } from '@gitbeaker/node';

import nameByHeader from './name-by-header.js';
import nameByUrl from './name-by-url.js';

const commitGroups = new Map<string, Map<string, string | NodeJS.ArrayBufferView>>();

export namespace writer {
	export type Options<T extends Record<string, unknown>> = {
		repository?: string;
		branch?: string;
		cwd?: string;
		authorName?: string;
		authorEmail?: string;
		commiterName?: string;
		commiterEmail?: string;
		message?: string;
		commitGroupKey?: string;
		namer?: { (data: Readonly<T>): string | undefined | void | Promise<string | undefined | void>; } | { (data: Readonly<T>): string | undefined | void | Promise<string | undefined | void>; }[];
		renderer(data: Readonly<T>): string | NodeJS.ArrayBufferView | undefined | void | Promise<string | NodeJS.ArrayBufferView | undefined | void>;
		onError?(error: unknown): void;
	} & ConstructorParameters<typeof Gitlab>[0];
}

/**
 * Writes documents to a gitlab instance.
 */
export async function writer<T extends Record<string, unknown>>({
	host,
	repository = '.',
	branch = 'master',
	cwd = 'dist',
	authorName = 'anonymous',
	authorEmail = 'anonymous@example.com',
	commiterName = authorName,
	commiterEmail = authorEmail,
	message = 'Not provided',
	namer = [nameByUrl, nameByHeader, () => { throw new Error('Naming error: could not create an output filename based on .url or .header.path properties.'); }],
	renderer,
	onError = error => { console.error(error); },
	commitGroupKey = `${host}/${repository}/${branch}/${authorName}/${commiterName}/${message}`,
	...gitlabOptions
}: writer.Options<T>) {
	if (!Array.isArray(namer)) namer = [namer];

	if (typeof repository !== 'string') throw new Error('Argument type mismatch, \'repository\' expects a string.');
	if (typeof branch !== 'string') throw new Error('Argument type mismatch, \'branch\' expects a string.');
	if (typeof authorName !== 'string') throw new Error('Argument type mismatch, \'authorName\' expects a string.');
	if (typeof authorEmail !== 'string') throw new Error('Argument type mismatch, \'authorEmail\' expects a string.');
	if (typeof commiterName !== 'string') throw new Error('Argument type mismatch, \'commiterName\' expects a string.');
	if (typeof commiterEmail !== 'string') throw new Error('Argument type mismatch, \'commiterEmail\' expects a string.');
	if (typeof message !== 'string') throw new Error('Argument type mismatch, \'message\' expects a string.');
	if (typeof cwd !== 'string') throw new Error('Argument type mismatch, \'cwd\' expects a string.');
	if (namer.some(x => typeof x !== 'function')) throw new Error('Argument type mismatch, \'namer\' expects a function or an array of functions.');
	if (typeof renderer !== 'function') throw new Error('Argument type mismatch, \'renderer\' expects a function.');
	if (typeof onError !== 'function') throw new Error('Argument type mismatch, \'onError\' expects a function.');
	if (typeof commitGroupKey !== 'string') throw new Error('Argument type mismatch, \'commitGroupKey\' expects a string.');

	const write = async function (data: T) {
		try {
			let outputPath;
			for (const fn of namer as any) {
				outputPath = await fn(data);
				if (outputPath && typeof outputPath === 'string') break;
			}
			if (!outputPath || typeof outputPath !== 'string') return;

			const rendered = await renderer(data);
			if (!rendered) return;

			let commitGroup;
			if (commitGroups.has(commitGroupKey)) {
				commitGroup = commitGroups.get(commitGroupKey) as Map<any, any>;
			} else {
				commitGroup = new Map();
				commitGroups.set(commitGroupKey, commitGroup)
			}

			commitGroup.set(path.join(cwd, outputPath), rendered);
		} catch (error) {
			onError(error);
		}
	};

	write.teardown = async () => {
		const commitGroup = commitGroups.get(commitGroupKey);
		if (commitGroup) {
			const gitlab = new Gitlab({ host, ...gitlabOptions });

			const tree = new Set<string>();
			const dirs = new Set<string>();

			for (const dirent of await gitlab.Repositories.tree(repository, { path: cwd, ref: branch, recursive: true })) {
				if (dirent.type === 'blob') {
					tree.add(dirent.path);
				} else {
					dirs.add(dirent.path);
				}
			}

			const actions: Parameters<typeof gitlab.Commits.create>[3] = [];
			for (const [path, content] of commitGroup.entries()) {
				if (dirs.has(path)) onError(new Error(`Invalid filename, directory already exists with this name: ${path}`));

				actions.push({
					action: tree.has(path) ? 'update' : 'create',
					filePath: path,
					content: (typeof content === 'string' ? Buffer.from(content) : content).toString('base64'),
					encoding: 'base64',
				});
			}

			await gitlab.Commits.create(repository, branch, message, actions);
		}
	};
};

export function clearPendingCommitGroups() {
	for (const k of commitGroups.keys()) {
		commitGroups.delete(k);
	}
}

export default writer;

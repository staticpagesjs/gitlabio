import { Gitlab } from '@gitbeaker/node';

import { requesterFn } from './requester-fn.js';
import { findByGlob } from './find-by-glob.js';

export namespace reader {
	export type Options<T extends Record<string, unknown>, E extends object = findByGlob.Options> = {
		repository: string;
		branch?: string;
		cwd?: string;
		mode?(options: E): Iterable<string> | AsyncIterable<string>;
		parser(body: Buffer, file: string, options: Options<T, E>): T | Promise<T>;
		onError?(error: unknown): void;
	} & E & ConstructorParameters<typeof Gitlab>[0];
}

/**
 * Reads documents from a gitlab instance.
 */
export async function* reader<T extends Record<string, unknown>, E extends object = findByGlob.Options>(options: reader.Options<T, E>) {
	const optionsWithDefaults: reader.Options<T, E> = {
		branch: 'master',
		cwd: 'pages',
		mode: findByGlob,
		onError: error => { console.error(error); },
		...options,
	};
	const { repository, branch, cwd, mode, parser, onError } = optionsWithDefaults;

	if (typeof mode !== 'function') throw new Error('Argument type mismatch, \'mode\' expects a function.');

	const files = mode(optionsWithDefaults);

	if (typeof (files as any)[Symbol.iterator] !== 'function' && typeof (files as any)[Symbol.asyncIterator] !== 'function') throw new Error('Argument type mismatch, \'mode\' expects a function that returns an Iterable or an AsyncIterable.');
	if (typeof parser !== 'function') throw new Error('Argument type mismatch, \'parser\' expects a function.');
	if (typeof onError !== 'function') throw new Error('Argument type mismatch, \'onError\' expects a function.');
	if (typeof cwd !== 'string') throw new Error('Argument type mismatch, \'cwd\' expects a string.');
	if (typeof repository !== 'string') throw new Error('Argument type mismatch, \'repository\' expects a string.');
	if (typeof branch !== 'string') throw new Error('Argument type mismatch, \'branch\' expects a string.');

	const gitlab = new Gitlab({
		requesterFn,
		...options,
	});

	for await (const file of files) {
		try {
			const contents: Buffer = await gitlab.RepositoryFiles.showRaw(repository, file, { ref: branch }) as any;
			yield await parser(
				contents,
				file,
				optionsWithDefaults
			);
		} catch (error) {
			onError(error);
		}
	}
}

export default reader;

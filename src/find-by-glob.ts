import { normalize, relative } from 'path/posix';
import micromatch from 'micromatch';
import { Gitlab } from '@gitbeaker/node';

export namespace findByGlob {
	export type Options = {
		repository?: string;
		branch?: string;
		cwd?: string;
		pattern?: string | string[];
		ignore?: string | string[];
		filter?(file: string): boolean;
	} & ConstructorParameters<typeof Gitlab>[0];
}

/**
 * Finds files by glob pattern in a git repository.
 * Always returns relative paths to cwd.
 */
export async function* findByGlob({
	repository = '.git',
	branch = 'master',
	cwd = '.',
	pattern = '**',
	ignore,
	filter,
	...gitlabOptions
}: findByGlob.Options): AsyncIterable<string> {
	// normalize cwd
	let ncwd = normalize(cwd).replace(/\\/g, '/');
	if (!ncwd.endsWith('/')) ncwd += '/';
	if (ncwd.startsWith('/')) ncwd = ncwd.substring(1);

	const mmOpts = { ignore };

	const gitlab = new Gitlab(gitlabOptions);

	const files = (
		await gitlab.Repositories.tree(repository, { path: ncwd, ref: branch, recursive: true })
	)
		.filter(x => x.type === 'blob')
		.map(x => relative(ncwd, x.path));

	if (typeof filter === 'function') {
		for (const file of files) {
			if (micromatch.isMatch(file, pattern, mmOpts) && filter(file)) yield file;
		}
	} else {
		for (const file of files) {
			if (micromatch.isMatch(file, pattern, mmOpts)) yield file;
		}
	}
}

export default findByGlob;

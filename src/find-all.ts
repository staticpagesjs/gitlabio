import { normalize, relative } from 'path/posix';
import { Gitlab } from '@gitbeaker/node';

export namespace findAll {
	export type Options = {
		repository?: string;
		branch?: string;
		cwd?: string;
		filter?(file: string): boolean;
	} & ConstructorParameters<typeof Gitlab>[0];
}

/**
 * Finds all files in a specified directory of a git repository.
 * Always returns relative paths to cwd.
 */
export async function* findAll({
	repository = '.git',
	branch = 'master',
	cwd = '.',
	filter,
	...gitlabOptions
}: findAll.Options): AsyncIterable<string> {
	// normalize cwd
	let ncwd = normalize(cwd).replace(/\\/g, '/');
	if (!ncwd.endsWith('/')) ncwd += '/';
	if (ncwd.startsWith('/')) ncwd = ncwd.substring(1);

	const gitlab = new Gitlab(gitlabOptions);

	const files = (
		await gitlab.Repositories.tree(repository, { path: ncwd, ref: branch, recursive: true })
	)
		.filter(x => x.type === 'blob')
		.map(x => relative(ncwd, x.path));

	if (typeof filter === 'function') {
		for (const file of files) {
			if (filter(file)) yield file;
		}
	} else {
		for (const file of files) {
			yield file;
		}
	}
}

export default findAll;

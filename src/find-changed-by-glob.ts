import { normalize, relative } from 'path/posix';
import micromatch from 'micromatch';
import { Gitlab } from '@gitbeaker/node';

export namespace findChangedByGlob {
	export type Options = {
		repository?: string;
		branch?: string;
		cwd?: string;
		pattern?: string | string[];
		ignore?: string | string[];
		filter?(file: string): boolean;
		storage: {
			get(): string | undefined | Promise<string | undefined>;
			set(commit: string): void;
		};
	} & ConstructorParameters<typeof Gitlab>[0];
}

/**
 * Finds files by glob pattern in a git repository, keeping only those where the
 * file is modified since the commit provided by `storage.get()`.
 */
export async function* findChangedByGlob({
	repository = '.git',
	branch = 'master',
	cwd = '.',
	pattern = '**',
	ignore,
	filter,
	storage,
	...gitlabOptions
}: findChangedByGlob.Options) {
	// normalize cwd
	let ncwd = normalize(cwd).replace(/\\/g, '/');
	if (!ncwd.endsWith('/')) ncwd += '/';
	if (ncwd.startsWith('/')) ncwd = ncwd.substring(1);

	const gitlab = new Gitlab(gitlabOptions);
	const mmOpts = { ignore };
	const currCommit = (await gitlab.Commits.show(repository, branch)).id;
	const pastCommit = await storage.get();

	// get file list since previous commit or all files if no previous commit
	let files;
	if (pastCommit) {
		files = (
			// TODO: try to find a cheaper alternative
			await gitlab.Repositories.compare(repository, pastCommit, branch)
		).diffs
			?.map(x => relative(ncwd, x.new_path))
			?? [];
	} else {
		files = (
			await gitlab.Repositories.tree(repository, { path: ncwd, ref: branch, recursive: true })
		)
			.filter(x => x.type === 'blob')
			.map(x => relative(ncwd, x.path));
	}

	if (typeof filter === 'function') {
		for (const file of files) {
			if (micromatch.isMatch(file, pattern, mmOpts) && filter(file)) yield file;
		}
	} else {
		for (const file of files) {
			if (micromatch.isMatch(file, pattern, mmOpts)) yield file;
		}
	}
	storage.set(currCommit);
}

export default findChangedByGlob;

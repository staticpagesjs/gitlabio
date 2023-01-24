import { normalize, relative } from 'path/posix';
import micromatch from 'micromatch';
import { Gitlab } from '@gitbeaker/node';

export namespace findChangedOrTriggeredByGlob {
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
		triggers: Record<string, string | string[] | { (matches: string[]): string[]; }>;
		triggersCwd?: string;
	} & ConstructorParameters<typeof Gitlab>[0];
}

const getTriggered = async (gitlab: InstanceType<typeof Gitlab>, repository: string, ref: string, cwd: string, pastCommit: string | undefined, triggers: Record<string, string | string[] | { (matches: string[]): string[]; }>) => {
	const result = new Set<string>();

	let ncwd = normalize(cwd).replace(/\\/g, '/');
	if (!ncwd.endsWith('/')) ncwd += '/';
	if (ncwd.startsWith('/')) ncwd = ncwd.substring(1);

	let files;
	if (pastCommit) {
		files = (
			// TODO: try to find a cheaper alternative
			await gitlab.Repositories.compare(repository, pastCommit, ref)
		).diffs
			?.map(x => relative(ncwd, x.new_path))
			?? [];
	} else {
		files = (
			await gitlab.Repositories.tree(repository, { path: ncwd, ref: ref, recursive: true })
		)
			.filter(x => x.type === 'blob')
			.map(x => relative(ncwd, x.path));
	}

	for (const srcPattern of Object.keys(triggers)) {
		const filesMatchingSrcPattern = micromatch(files, srcPattern);

		if (filesMatchingSrcPattern.length > 0) {
			const dest = triggers[srcPattern];
			if (typeof dest === 'function') {
				const destPatterns = dest(filesMatchingSrcPattern);
				for (const pattern of destPatterns) {
					result.add(pattern);
				}
			} else if (Array.isArray(dest)) {
				for (const pattern of dest) {
					result.add(pattern);
				}
			} else {
				result.add(dest);
			}
		}
	}
	return [...result];
};

/**
 * Finds files by glob pattern, keeping only those where the
 * modification time is newer than the time provided by `storage.get()` or
 * the file path matches patterns provided by triggering files that are newer.
 */
export async function* findChangedOrTriggeredByGlob({
	repository = '.git',
	branch = 'master',
	cwd = '.',
	pattern = '**',
	ignore,
	filter,
	storage,
	triggers,
	triggersCwd = cwd,
	...gitlabOptions
}: findChangedOrTriggeredByGlob.Options) {
	// normalize cwd
	let ncwd = normalize(cwd).replace(/\\/g, '/');
	if (!ncwd.endsWith('/')) ncwd += '/';
	if (ncwd.startsWith('/')) ncwd = ncwd.substring(1);

	const gitlab = new Gitlab(gitlabOptions);
	const mmOpts = { ignore };
	const currCommit = (await gitlab.Commits.show(repository, branch)).id;
	const pastCommit = await storage.get();

	// get file list since previous commit or all files if no previous commit
	if (pastCommit) {
		const files = (
			// TODO: try to find a cheaper alternative
			await gitlab.Repositories.compare(repository, pastCommit, branch)
		).diffs
			?.map(x => relative(ncwd, x.new_path))
			?? [];

		// TODO: this call should be optimized way better
		const triggeredPatterns = await getTriggered(gitlab, repository, branch, triggersCwd, pastCommit, triggers);

		if (typeof filter === 'function') {
			for (const file of files) {
				if (
					(
						micromatch.isMatch(file, pattern, mmOpts) ||
						micromatch.isMatch(file, triggeredPatterns)
					) &&
					filter(file)
				)
					yield file;
			}
		} else {
			for (const file of files) {
				if (
					micromatch.isMatch(file, pattern, mmOpts) ||
					micromatch.isMatch(file, triggeredPatterns)
				)
					yield file;
			}
		}
	} else {
		const files = (
			await gitlab.Repositories.tree(repository, { path: ncwd, ref: branch, recursive: true })
		)
			.filter(x => x.type === 'blob')
			.map(x => relative(ncwd, x.path));

		if (typeof filter === 'function') {
			for (const file of files) {
				if (micromatch.isMatch(file, pattern, mmOpts) && filter(file))
					yield file;
			}
		} else {
			for (const file of files) {
				if (micromatch.isMatch(file, pattern, mmOpts))
					yield file;
			}
		}
	}

	storage.set(currCommit);
}

export default findChangedOrTriggeredByGlob;

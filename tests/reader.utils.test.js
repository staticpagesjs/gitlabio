import { findAll, findByGlob, findChangedByGlob, findChangedOrTriggeredByGlob, parseHeader } from '../esm/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const inputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'input');

test('findAll() reads everything and possible to filter', async () => {
	const expected = ['file1.txt', 'file2.txt', 'folder/file3.txt'];

	const output = [...findAll({
		cwd: inputDir,
		filter: x => !x.includes('skip.txt'),
	})];

	output.sort((a, b) => a.localeCompare(b));

	expect(output).toEqual(expected);
});

test('findByGlob() reads by pattern and possible to filter and ignore', async () => {
	const expected = ['file1.txt'];

	const output = [...findByGlob({
		cwd: inputDir,
		pattern: '*.txt',
		ignore: 'skip.txt',
		filter: x => !x.endsWith('2.txt'),
	})];

	output.sort((a, b) => a.localeCompare(b));

	expect(output).toEqual(expected);
});

test('findChangedByGlob() filters newer files only', async () => {
	const expected = ['file1.txt'];

	const now = new Date();
	const then = new Date();
	then.setFullYear(then.getFullYear() - 1);
	const last = new Date();
	last.setMonth(last.getMonth() - 6);

	const incremental = {
		date: null,
		get() { return last; },
		set(d) { incremental.date = d; }
	};

	fs.utimesSync(inputDir + '/file1.txt', now, now);
	fs.utimesSync(inputDir + '/file2.txt', then, then);

	const asyncIterable = findChangedByGlob({
		cwd: inputDir,
		pattern: '*.txt',
		ignore: 'skip.txt',
		storage: incremental,
	});

	const output = [];
	for await (const item of asyncIterable) {
		output.push(item);
	}

	output.sort((a, b) => a.localeCompare(b));

	expect(output).toEqual(expected);
	expect(incremental.date).not.toBeNull();
});

test('findChangedOrTriggeredByGlob() filters newer files plus triggered ones only', async () => {
	const expected = ['file1.txt', 'folder/file3.txt'];

	const now = new Date();
	const then = new Date();
	then.setFullYear(then.getFullYear() - 1);
	const last = new Date();
	last.setMonth(last.getMonth() - 6);

	const incremental = {
		date: null,
		get() { return last; },
		set(d) { incremental.date = d; }
	};

	fs.utimesSync(inputDir + '/file1.txt', now, now);
	fs.utimesSync(inputDir + '/file2.txt', then, then);
	fs.utimesSync(inputDir + '/folder/file3.txt', then, then);

	const asyncIterable = findChangedOrTriggeredByGlob({
		cwd: inputDir,
		pattern: '**/*.txt',
		ignore: 'skip.txt',
		storage: incremental,
		triggers: {
			'*1.txt': 'folder/*'
		}
	});

	const output = [];
	for await (const item of asyncIterable) {
		output.push(item);
	}

	output.sort((a, b) => a.localeCompare(b));

	expect(output).toEqual(expected);
	expect(incremental.date).not.toBeNull();
});

test('parseHeader() makes a standard page object with header', async () => {
	const expected = {
		header: {
			cwd: inputDir.replace(/\\/g, '/'),
			path: 'folder/file3.txt',
			dirname: 'folder',
			basename: 'file3',
			extname: '.txt'
		},
		body: 'hello world'
	};

	const parser = parseHeader(b => JSON.parse(b.toString()));

	const output = parser(Buffer.from('{"body":"hello world"}'), 'folder/file3.txt', { cwd: inputDir });

	expect(output).toEqual(expected);
});

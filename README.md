# Static Pages / File provider

This package provides a reader which parses files to an AsyncIterable document stream, and a writer that renders documents to files on the filesystem. Additional utilities also available in this package to find, filter and parse documents.


## Reader

The `reader` is an abstract factory that creates an AsyncIterable.

### Usage
```js
import * as file from '@static-pages/file-provider';

const asyncIterable = file.reader({
  mode: file.findByGlob,
  cwd: 'pages',
  pattern: '**/*.json',
  ignore: '**/ignored-file*',
  parser: file.parseHeader(
    body => JSON.parse(body.toString())
  ),
});

// one example source file:
// # /path/to/pages/my/folder/file.json
// {"hello":"world"}

// one item in the asyncIterable:
// {
//   header: {
//     cwd: '/path/to/pages',
//     path: 'my/folder/file.json',
//     dirname: 'my/folder',
//     basename: 'file',
//     extname: '.json'
//   },
//   hello: 'world'
// }
```

### Utilities for the reader

To specify the exact implementation of the reader you can set `options.mode` to one of the following file listing provider:

- `findAll` is a simple recursive directory lister, it will collect all files in the specified directory.
- `findByGlob` (default) is a glob matcher which will collect all files matching a given pattern.
- `findChangedByGlob` is a glob matcher that also filters files based on their `mtime` property keeping the modified (newer) files only.
- `findChangedOrTriggeredByGlob` is the same as `findChangedByGlob` with the addition of a triggering mechanism: You can specify file relations between glob patterns. When a file matches a pattern and its `mtime` is newer than a given time, it can 'trigger' another file, meaning that file will be included in the result.

Parsing the file contents to an understandable document is another task of the reading process. At this parsing step, a header may be added to the document to help tracking of the source file.

- `parseHeader` captures the filename of the iterated file and creates a `header` object (see reader usage example).


## Writer

The `writer` is a factory that creates a writer function.

### Usage
```js
import { existsSync } from 'fs';
import * as file from '@static-pages/file-provider';

const write = file.writer({
  cwd: 'dist',
  namer: [
    file.nameByUrl,
    file.nameByHeader,
    () => { throw new Error('Cant name document.'); }
  ],
  renderer: d => d.body,
});

const pageData = {
  url: 'folder/file',
  body: '[file contents]',
};

// writes to 'dist/folder/file.html'
write(pageData);
```
### Utilities for the writer

There are two helper functions for output naming.

- `nameByHeader` tries to extract `header.path` and replace its extension to `.html`.
- `nameByUrl` tries to use the `url` property and appends a `.html` to it.


## Docs

### __`reader(options: reader.Options): AsyncIterable<Record<string, unknown>>`__

Reads documents from the filesystem. The base implementation is specified by the `mode` option, depending on that setting the available options may change.

#### `options`
- `cwd` (default: `pages`) sets the current working directory.
- `mode` (default: `findByGlob`) a factory that provides an iterable or an async iterable file list, eg. `findByGlob` or `findAll`. The reader will iterate over this file list when reading the files into documents. The factory will recieve all `options` set on the `reader`, so changing the value of the `mode` may change how you need to parameterize the `reader`.
- `parser` (required) a function that recieves the file contents as a `Buffer` and produces a `Record<string, unknown>` document. Call `buffer.toString()` to convert the buffer to an utf8 string.
- `onError` (default: `(e) => { console.error(e); }`) an error handler that gets called when something throws while reading and parsing the files. Set it to `(e) => { throw e; }` to completely halt the iteration.


### __`findAll(options: findAll.Options): Iterable<string>`__

Generates an iterable list of all existing files in a directory. The file paths are relative paths.

#### `options`
- `cwd` (default: `.`) sets the current working directory.
- `filter` (default: `undefined`) a callback function that gets called on every file name. Return `true` to keep that filename.


### __`findByGlob(options: findByGlob.Options): Iterable<string>`__

Generates an iterable list of files matching a pattern. The file paths are relative paths. See the file reader example.

#### `options`
- `cwd` (default: `.`) sets the current working directory.
- `pattern` (default: `**`) glob pattern(s) that selects the files to read. Can be a `string` or a `string` array.
- `ignore` (default: `undefined`) glob pattern(s) that selects the files to ignore. Can be a `string` or a `string` array.
- `filter` (default: `undefined`) a callback function that gets called on every file name. Return `true` to keep that filename.


### __`findChangedByGlob(options: findChangedByGlob.Options): AsyncIterable<string>`__

Decorates the `findByGlob` mode, adding capability to ignore files that are older than a set date. This date is retrieved by `storage.get()` and when the iteration is done the `storage.set(date)` is called to preserve the current time.

#### `options`
- `cwd` (default: `.`) sets the current working directory.
- `pattern` (default: `**`) glob pattern(s) that selects the files to read. Can be a `string` or a `string` array.
- `ignore` (default: `undefined`) glob pattern(s) that selects the files to ignore. Can be a `string` or a `string` array.
- `filter` (default: `undefined`) a callback function that gets called on every file name. Return `true` to keep that filename.
- `storage` (required) an object with `get()` and `set()` members to  store and retrieve `Date` objects. These dates indicates the time of the last execution occured.


### __`findChangedOrTriggeredByGlob(options: findChangedOrTriggeredByGlob.Options): AsyncIterable<string>`__

Decorates the `findByGlob` mode, adding capability to ignore files that are older than a set date. This date is retrieved by `storage.get()` and when the iteration is done the `storage.set(date)` is called to preserve the current time. Additionally you must provide a pattern map which describes file relations, eg.: when a file is modified and matches a pattern like `abc*.yaml`, we want to keep the files in the iterable that matches `efg*.md`.

#### `files`
An iterable or an async iterable list of file names. To generate these lists see `findByGlob()` and `findAll()`.  
Required.

#### `options`
- `cwd` (default: `.`) sets the current working directory.
- `pattern` (default: `**`) glob pattern(s) that selects the files to read. Can be a `string` or a `string` array.
- `ignore` (default: `undefined`) glob pattern(s) that selects the files to ignore. Can be a `string` or a `string` array.
- `filter` (default: `undefined`) a callback function that gets called on every file name. Return `true` to keep that filename.
- `storage` (required) an object with `get()` and `set()` members to  store and retrieve `Date` objects. These dates indicates the time of the last execution occured.
- `triggers` (required) an object where the keys and values are glob patterns which defines relations between files. When key matches a modified or new file, all files will be filtered in the result that matches the value.


### __`parseHeader<R extends Record<string, unknown>>(bodyParser?: { (body: Buffer, file: string, options: Record<string, unknown>): R; }): { (body: Buffer, file: string, options: Record<string, unknown>): R; }`__

Helper to parse the full file path into a header segment. See the file reader example.

The returned document contains these properties:
- `data.header.cwd` is the absolute path of the `cwd` set in the options.
- `data.header.path` is the file path relative to the `header.cwd`.
- `data.header.dirname` is equivalent to `path.dirname(header.path)`.
- `data.header.basename` is equivalent to `path.basename(header.path, header.extname)`.
- `data.header.extname` is equivalent to `path.extname(header.path)`.

#### `bodyParser`
Callback function to parse the contents of the file. Eg. a json file should use `d => JSON.parse(d.toString())`.  
This function can be sync or async; the `parseHeader` returns a sync function when the `bodyParser` is sync, and returns an async function when `bodyParser` is async.
Default: return the unchanged buffer in a property named `body`.


### __`writer(options: writer.Options): { (data: Record<string, unknown>): void }`__

Writes documents to the filesystem.

#### `options`
- `cwd` (default: `.`) sets the current working directory.
- `namer` (required) a callback (async or sync) that generates a file name for the output. It can be function or an array of functions.
- `renderer` (required) a callback (async or sync) that generates the file contents. It can return a `string`, a `NodeJS.ArrayBufferView` or `void`. In the latter case, the writing is omitted.
- `onError` (default: `(e) => { console.error(e); }`) an error handler that gets called when something throws while rendering and writing the files.


### __`nameByHeader(data: Record<string, unknown>): string | void`__

Tries to name output files the same as the input was. Replaces the original filename extension to `.html`.

### __`nameByUrl(data: Record<string, unknown>): string | void`__

Tries to name output files by the `url` property of the document. Appends `.html` extension to it.


### Other notes

- Windows style backslashes are always normalized to Unix style forward slashes in paths.


## Where to use this?
This module can be used to generate static HTML pages from/to file based sources. Read more at the [Static Pages JS project page](https://staticpagesjs.github.io/).

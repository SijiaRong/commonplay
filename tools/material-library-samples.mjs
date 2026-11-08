// Export the live atlas catalog for the file:// browser, which cannot fetch ES modules.
import {readFile} from 'node:fs/promises';
const root = new URL('../material-atlas/dist/', import.meta.url);
globalThis.fetch = async path => new Response(await readFile(new URL(path, root)));
const {entries} = await import(new URL('catalog.js', root));
process.stdout.write(JSON.stringify(entries.map(({id, project, group, name, description}) => ({
  id, project, group, name, description
}))));

#!/usr/bin/env node
// Minimal Java-to-TypeScript syntax converter for bulk file conversion
// Usage: node java2ts.js input.java output.ts

const fs = require('fs');

const replacements = [
    // Static imports to ES6 imports
    [/import static ([a-zA-Z0-9_.]+)\.\*;/g, 'import * as $1 from "$1";'],
    // Java array initializer to TS array
    [/= \{([^}]+)\};/g, '= [$1];'],
    // Remove synchronized blocks
    [/synchronized\s*\([^)]*\)\s*\{/g, '{'],
    // Remove final in parameter lists
    [/final\s+([a-zA-Z0-9_<>,\[\]]+\s+[a-zA-Z0-9_]+)/g, '$1'],
    // Optional<T> to T | undefined
    [/Optional<([^>]+)>/g, '$1 | undefined'],
    // @SuppressWarnings and @FunctionalInterface to comments
    [/\@SuppressWarnings\([^)]*\)/g, ''],
    [/\@FunctionalInterface/g, ''],
    // Remove Java-specific keywords
    [/\b(public|private|protected|synchronized|volatile|transient|strictfp)\b/g, ''],
    [/\bstatic final\b/g, 'static readonly'],
    [/\bfinal\b/g, 'readonly'],
    // Types
    [/\bboolean\b/g, 'boolean'],
    [/\bbyte\b|\bshort\b|\bint\b|\blong\b|\bfloat\b|\bdouble\b/g, 'number'],
    [/\bString\b/g, 'string'],
    [/\bchar\b/g, 'string'],
    // Generics and collections
    [/\bList<([^>]+)>/g, 'Array<$1>'],
    [/\bArrayList<([^>]+)>/g, 'Array<$1>'],
    [/\bHashMap<([^,>]+),\s*([^>]+)>/g, 'Map<$1, $2>'],
    [/\bMap<([^,>]+),\s*([^>]+)>/g, 'Map<$1, $2>'],
    [/\bSoftReference<([^>]+)>/g, '$1'],
    // Arrays
    [/([a-zA-Z0-9_]+)\s*\[\s*\]/g, '$1[]'],
    [/new ([a-zA-Z0-9_]+)\[\s*\]\s*{([^}]*)}/g, '[$2]'],
    // Enums
    [/\benum\s+([A-Za-z0-9_]+)\s*{/g, 'export enum $1 {'],
    // Remove annotations
    [/@[A-Za-z0-9_]+/g, ''],
    // Remove package/import/throws
    [/\bpackage [^;]+;/g, ''],
    [/\bimport [^;]+;/g, ''],
    [/\bthrows [A-Za-z0-9_, ]+/g, ''],
    // Remove .class
    [/([A-Za-z0-9_]+)\.class/g, '$1'],
    // Remove @Override
    [/@Override/g, ''],
    // Remove @Deprecated
    [/@Deprecated/g, ''],
    // Remove trailing whitespace
    [/[ \t]+$/gm, ''],
    // Remove empty lines
    [/^\s*\n/gm, ''],
    // Class and interface
    [/\bclass ([A-Za-z0-9_]+)\s*(extends\s+[A-Za-z0-9_]+)?\s*(implements\s+[A-Za-z0-9_, ]+)?\s*{/g, (m, name, ext, impl) => {
        let out = `export class ${name}`;
        if (ext) out += ` ${ext}`;
        if (impl) out += ` ${impl.replace(/implements/, 'implements')}`;
        return out + ' {';
    }],
    [/\binterface ([A-Za-z0-9_]+)\s*{/g, 'export interface $1 {'],
    // New array
    [/new ([A-Za-z0-9_]+)\[([0-9]*)\]/g, 'new Array<$1>($2)'],
    // System.out.println
    [/System\.out\.println\s*\(([^)]*)\);/g, 'console.log($1);'],
    // System.err.println
    [/System\.err\.println\s*\(([^)]*)\);/g, 'console.error($1);'],
    // StringBuilder to string
    [/new StringBuilder\(([^)]*)\)/g, '[$1].join("")'],
    [/StringBuilder/g, 'string'],
    // Integer.parseInt, Double.parseDouble, etc.
    [/Integer\.parseInt\s*\(([^)]*)\)/g, 'Number($1)'],
    [/Double\.parseDouble\s*\(([^)]*)\)/g, 'Number($1)'],
    [/Float\.parseFloat\s*\(([^)]*)\)/g, 'Number($1)'],
    // Math methods
    [/Math\.([a-zA-Z0-9_]+)\s*\(/g, 'Math.$1('],
    // assert
    [/assert\s*\(([^)]*)\);/g, 'console.assert($1);'],
    // catch (Exception e)
    [/catch \(([^)]+)\)/g, 'catch ($1: any)'],
    // instanceof
    [/instanceof/g, 'instanceof'],
    // super.method
    [/super\.([a-zA-Z0-9_]+)\s*\(/g, 'super.$1('],
    // Remove semicolons after braces
    [/([{}])\s*;/g, '$1'],
    // Remove multiple semicolons
    [/;;+/g, ';'],
    // Method/constructor/function forms
    // Method: name(params) {
    [/\b([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*{/g, '$1($2) {'],
    // Method: name(params): ReturnType {
    [/\b([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*:\s*([A-Za-z0-9_]+)\s*{/g, '$1($2): $3 {'],
    // Arrow function: name(params) =>
    [/\b([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*=>/g, '$1($2) =>'],
    // Arrow function: name(params) => {
    [/\b([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*=>\s*{/g, '$1($2) {'],
    // Arrow function: name(params): ReturnType => {
    [/\b([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*:\s*([A-Za-z0-9_]+)\s*=>\s*{/g, '$1($2): $3 {'],
    // Character.isDigit
    [/Character\.isDigit\s*\(([^)]*)\)/g, '/\\d/.test($1)'],
    // Remove 'default:' (Java switch default)
    [/^\s*default:/gm, 'default:'],
    // Remove 'case ...:' (Java switch case)
    [/^\s*case ([^:]+):/gm, 'case $1:'],
    // Remove 'break;' (Java switch break)
    [/^\s*break;/gm, 'break;'],
    // Remove 'continue;' (Java loop continue)
    [/^\s*continue;/gm, 'continue;'],
    // Remove 'return;' (Java return)
    [/^\s*return;/gm, 'return;'],
    // Remove 'this.' (no-op, but for completeness)
    [/this\./g, 'this.'],
];

if (process.argv.length < 4) {
    console.error('Usage: node java2ts.js input.java output.ts');
    process.exit(1);
}


const inputFile = process.argv[2];
const outputFile = process.argv[3];
let java = fs.readFileSync(inputFile, 'utf8');

// Convert Java default methods in interfaces to TypeScript
java = java.replace(/^([ \t]*)default\s+([a-zA-Z0-9_<>,\[\]]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{/gm, (m, ws, ret, name, params) => {
    const paramList = params.split(',').map(p => {
        const parts = p.trim().match(/^([a-zA-Z0-9_<>,\[\]]+)\s+([a-zA-Z0-9_]+)$/);
        if (parts) return `${parts[2]}: ${parts[1]}`;
        return p.trim();
    }).join(', ');
    return `${ws}${name}(${paramList}): ${ret} {`;
});

// Apply all regex replacements
// --- Additional regexes for robust Java→TypeScript conversion ---
// 1. Java array initializers (e.g. static number[] table = [ ... ];)
java = java.replace(/static\s+([a-zA-Z0-9_<>\[\]]+)\s+([a-zA-Z0-9_]+)\s*=\s*\{([^}]*)\};/g, 'static $2: $1 = [$3];');
java = java.replace(/([a-zA-Z0-9_<>\[\]]+)\s+([a-zA-Z0-9_]+)\s*=\s*\{([^}]*)\};/g, '$2: $1 = [$3];');

// 2. for/while/if/catch header normalization
// for (number i = 0, e = ...)
java = java.replace(/for\s*\(\s*number\s+([a-zA-Z0-9_]+)\s*=\s*([^;]+);\s*([a-zA-Z0-9_]+)\s*!=\s*([^;]+);\s*\+\+([a-zA-Z0-9_]+)\s*\)/g, 'for (let $1: number = $2; $3 != $4; ++$5)');
// for (number i = ...)
java = java.replace(/for\s*\(\s*number\s+([a-zA-Z0-9_]+)\s*=\s*([^;]+);/g, 'for (let $1: number = $2;');
// catch(IOException e: any)
java = java.replace(/catch\(([^)]+)\)/g, 'catch($1)');
java = java.replace(/catch\(([a-zA-Z0-9_]+) ([a-zA-Z0-9_]+): any\)/g, 'catch($2: any)');
// Remove Java checked exception types in catch
java = java.replace(/catch\(([a-zA-Z0-9_]+) ([a-zA-Z0-9_]+)\)/g, 'catch($2: any)');

// 3. static method normalization (static Type name(...) { ... })
java = java.replace(/static\s+([a-zA-Z0-9_<>\[\]]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{/g, 'static $2($3): $1 {');

// 4. Remove Java-specific keywords (final, synchronized, etc.)
java = java.replace(/\b(final|synchronized|volatile|transient|strictfp|native|throws|throw)\b/g, '');

// 5. Normalize array type declarations (number[] x → x: number[])
java = java.replace(/([a-zA-Z0-9_<>]+)\s*\[\]\s*([a-zA-Z0-9_]+)\b/g, '$2: $1[]');
for (const [pattern, replacement] of replacements)
    java = java.replace(pattern, replacement);

// Field: 'T v;' -> 'v: T;'
java = java.replace(/^([ \t]*)([a-zA-Z0-9_<>,\[\]]+)\s+([a-zA-Z0-9_]+)\s*;/gm, '$1$3: $2;');
// Field with init: 'T v = ...;' -> 'v: T = ...;'
java = java.replace(/^([ \t]*)([a-zA-Z0-9_<>,\[\]]+)\s+([a-zA-Z0-9_]+)\s*=\s*([^;]+);/gm, '$1$3: $2 = $4;');
// General: 'Type name' -> 'name: Type' (safe cases, not in comments/strings, skip lines starting with default)
java = java.replace(/^(?![ \t]*default\b).*\b([a-zA-Z0-9_<>,\[\]]+)\s+([a-zA-Z0-9_]+)\b(?!\s*[:=\(\[].*|\s*;)/gm, (m, type, name) => {
    // Avoid matching inside comments or after a colon/equals/paren/array
    if (/^(if|for|while|switch|catch|return|throw|new|class|interface|enum|extends|implements|package|import|public|private|protected|static|final|abstract|synchronized|volatile|transient|strictfp|@|\d)/.test(type))
        return m;
    return m.replace(new RegExp(type + '\\s+' + name), `${name}: ${type}`);
});
// Helper to convert all Java-style parameters in a parameter list to TypeScript order
function convertParams(paramStr) {
    // Split on commas not inside angle brackets or brackets
    const params = [];
    let depth = 0, last = 0;
    for (let i = 0; i < paramStr.length; ++i) {
        const c = paramStr[i];
        if (c === '<' || c === '[') depth++;
        if (c === '>' || c === ']') depth--;
        if (c === ',' && depth === 0) {
            params.push(paramStr.slice(last, i));
            last = i + 1;
        }
    }
    if (last < paramStr.length) params.push(paramStr.slice(last));
    return params.map(p => {
        p = p.trim().replace(/\s+/g, ' ');
        if (!p) return '';
        // Map Java types to TS types in each parameter
        p = p
            .replace(/\bbyte\b|\bshort\b|\bint\b|\blong\b|\bfloat\b|\bdouble\b/g, 'number')
            .replace(/\bboolean\b/g, 'boolean')
            .replace(/\bString\b/g, 'string')
            .replace(/\bchar\b/g, 'string')
            .replace(/\breader\b/g, 'reader')
            .replace(/\breadable\b/g, 'readable')
            .replace(/\bRandomAccessFile\b/g, 'RandomAccessFile')
            .replace(/\bVER\b/g, 'VER');
        // Try to split by last space: if both type and name, always output 'name: type'
        let m = p.match(/^(.+)\s+([a-zA-Z0-9_]+)$/);
        if (m) return `${m[2]}: ${m[1]}`;
        // Already in name: type form
        m = p.match(/^([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_<>,\[\]\.]+)$/);
        if (m) return `${m[1]}: ${m[2]}`;
        // If only a name, default to 'any'
        m = p.match(/^([a-zA-Z0-9_]+)$/);
        if (m) return `${m[1]}: any`;
        // If only a type, use '_: type'
        m = p.match(/^([a-zA-Z0-9_<>,\[\]\.]+)$/);
        if (m) return `_: ${m[1]}`;
        return p;
    }).join(', ');
}


// Method: 'T f(Type p, ...)' -> 'f(p: Type, ...): T'
java = java.replace(/^([ \t]*)([a-zA-Z0-9_<>,\[\]]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*{/gm, (m, ws, ret, name, params) => {
    if (name === 'constructor') return m;
    return `${ws}${name}(${convertParams(params)}): ${ret} {`;
});

// Method signature: 'T f(Type p, ...);' -> 'f(p: Type, ...): T;'
java = java.replace(/^([ \t]*)([a-zA-Z0-9_<>,\[\]]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*;/gm, (m, ws, ret, name, params) => {
    return `${ws}${name}(${convertParams(params)}): ${ret};`;
});

// Default method: 'default T f(Type p, ...)' -> 'f(p: Type, ...): T {'
java = java.replace(/^([ \t]*)default\s+([a-zA-Z0-9_<>,\[\]]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{/gm, (m, ws, ret, name, params) => {
    return `${ws}${name}(${convertParams(params)}): ${ret} {`;
});
// Constructor: 'ClassName(Type p, ...)' -> 'constructor(p: Type, ...)' (only if name matches class)
const classMatch = java.match(/export class ([A-Za-z0-9_]+)/);
if (classMatch) {
    const className = classMatch[1];
    // Robustly match Java constructor with any whitespace and formatting, always normalizing params
    // Match any line starting with className and '(', regardless of parameter content
    const ctorRegex = new RegExp(`^[ \t]*${className} *\((.*)\) *{`, 'gm');
    java = java.replace(ctorRegex, (m, params) => {
        return `constructor(${convertParams(params)}) {`;
    });
}
// Print all lines with both '(' and '{' to debug constructor/method formatting
java.split('\n').forEach(line => {
    if (line.includes('(') && line.includes('{'))
        console.log('DEBUG: candidate:', line);
});


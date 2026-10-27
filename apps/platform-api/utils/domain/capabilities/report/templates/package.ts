/* oxlint-disable unicorn/prefer-dom-node-append, unicorn/prefer-dom-node-remove, unicorn/prefer-modern-dom-apis, unicorn/prefer-spread -- @xmldom uses XML DOM Level 2 NodeLists and mutation APIs, not browser DOM convenience methods. */
import type { Document, Element, Node } from '@xmldom/xmldom';

import type { TemplateElement, TemplateManifest, TemplateRole } from './schema';

import { posix } from 'node:path';

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  types: 'http://schemas.openxmlformats.org/package/2006/content-types',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
};
export type OfficePackage = Record<string, Uint8Array>;
export const children = (
  node: Document | Element,
  namespace: string,
  name: string,
): Element[] => Array.from(node.getElementsByTagNameNS(namespace, name));
export const serializeXml = (node: Node) =>
  new XMLSerializer().serializeToString(node);
export function xml(source: string): Document {
  if (/<!DOCTYPE|<!ENTITY/iu.test(source))
    throw new Error('模板不能包含 DTD 或实体声明');
  return new DOMParser({
    onError: () => {
      throw new Error('模板 XML 无效');
    },
  }).parseFromString(source, 'application/xml');
}
export const readXml = (files: OfficePackage, name: string) =>
  xml(strFromU8(files[name] ?? new Uint8Array()));
export const writeXml = (files: OfficePackage, name: string, doc: Node) => {
  files[name] = strToU8(serializeXml(doc));
};
export function openOfficePackage(bytes: Uint8Array): OfficePackage {
  if (bytes.byteLength > 20 * 1024 * 1024)
    throw new Error('模板文件不能超过 20 MiB');
  let total = 0;
  let count = 0;
  const files = unzipSync(bytes, {
    filter(entry) {
      total += entry.originalSize;
      count++;
      if (
        total > 100 * 1024 * 1024 ||
        count > 2000 ||
        entry.originalSize > 30 * 1024 * 1024
      )
        throw new Error('模板解压后过大或文件过多');
      if (
        entry.name.split('/').includes('..') ||
        entry.name.includes('\\') ||
        entry.name.startsWith('/') ||
        /vbaProject|activeX\/.+|embeddings\/.+/iu.test(entry.name)
      )
        throw new Error('模板包含不支持的宏、嵌入对象或路径');
      return true;
    },
  });
  if (!files['[Content_Types].xml'])
    throw new Error('请上传有效的 DOCX 或 PPTX 文件');
  for (const [name, data] of Object.entries(files))
    if (/\.xml(?:\.rels)?$/u.test(name) || name.endsWith('.rels'))
      xml(strFromU8(data));
  const contentTypes = readXml(files, '[Content_Types].xml');
  if (
    contentTypes.documentElement?.namespaceURI !== NS.types ||
    contentTypes.documentElement.localName !== 'Types'
  )
    throw new Error('Office 内容类型清单无效');
  for (const entry of [
    ...children(contentTypes, NS.types, 'Override'),
    ...children(contentTypes, NS.types, 'Default'),
  ]) {
    if (
      /macroEnabled|vbaProject|activeX|oleObject/iu.test(
        entry.getAttribute('ContentType') ?? '',
      )
    )
      throw new Error('模板包含不支持的宏、控件或嵌入对象');
  }
  for (const part of Object.keys(files).filter((name) =>
    name.endsWith('.rels'),
  )) {
    for (const relationship of children(
      readXml(files, part),
      NS.rel,
      'Relationship',
    ))
      if (
        /\/(vbaProject|oleObject|package|control|activeX)$/iu.test(
          relationship.getAttribute('Type') ?? '',
        )
      )
        throw new Error('模板包含不支持的宏、控件或嵌入对象');
  }
  return files;
}
export const closeOfficePackage = (files: OfficePackage) =>
  zipSync(files, { level: 6 });
export function slideParts(files: OfficePackage): string[] {
  const doc = readXml(files, 'ppt/presentation.xml');
  const rel = readXml(files, 'ppt/_rels/presentation.xml.rels');
  const paths = new Map(
    children(rel, NS.rel, 'Relationship').map((item) => [
      item.getAttribute('Id'),
      item.getAttribute('Target') ?? '',
    ]),
  );
  return children(doc, NS.p, 'sldId').map((item) => {
    const target = paths.get(item.getAttributeNS(NS.r, 'id')) ?? '';
    const part = target.startsWith('/')
      ? target.slice(1)
      : `ppt/${target.replace(/^\.\//u, '')}`;
    if (!/^ppt\/slides\/slide\d+\.xml$/u.test(part) || !files[part])
      throw new Error('模板幻灯片关系无效');
    return part;
  });
}
export function elementNodes(doc: Document, format: 'docx' | 'pptx') {
  return format === 'docx'
    ? children(doc, NS.w, 'p')
    : children(doc, NS.p, 'sp').concat(children(doc, NS.p, 'pic'));
}
export function textOf(node: Element, format: 'docx' | 'pptx') {
  return children(node, format === 'docx' ? NS.w : NS.a, 't')
    .map((item) => item.textContent ?? '')
    .join('');
}
function inferredRole(text: string): { fieldName: string; role: TemplateRole } {
  const key = /^\s*\{\{\s*([\w.-]+)\s*\}\}\s*$/u.exec(text)?.[1] ?? '';
  const roles: Record<string, TemplateRole> = {
    title: 'title',
    summary: 'summary',
    section_title: 'section-title',
    section_body: 'section-body',
    images: 'images',
    caption: 'image-caption',
  };
  return { role: roles[key] ?? (key ? 'value' : 'fixed'), fieldName: key };
}
function shapeDefaults(
  files: OfficePackage,
  part: string,
  node: Element,
  depth = 0,
): Element[] {
  if (depth > 2) return [node];
  const placeholder = children(node, NS.p, 'ph')[0];
  if (!placeholder) return [node];
  const slash = part.lastIndexOf('/');
  const path = `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`;
  if (!files[path]) return [node];
  const rels = readXml(files, path);
  const target = children(rels, NS.rel, 'Relationship')
    .find((item) =>
      /\/(slideLayout|slideMaster)$/u.test(item.getAttribute('Type') ?? ''),
    )
    ?.getAttribute('Target');
  if (!target) return [node];
  const parentPart = target.startsWith('/')
    ? target.slice(1)
    : posix.normalize(posix.join(posix.dirname(part), target));
  if (!files[parentPart]) return [node];
  const doc = readXml(files, parentPart);
  const candidate = children(doc, NS.p, 'sp').find((shape) => {
    const other = children(shape, NS.p, 'ph')[0];
    return (
      other &&
      (placeholder.hasAttribute('idx')
        ? other.getAttribute('idx') === placeholder.getAttribute('idx')
        : (other.getAttribute('type') || 'obj') ===
          (placeholder.getAttribute('type') || 'obj'))
    );
  });
  return candidate
    ? [node, ...shapeDefaults(files, parentPart, candidate, depth + 1)]
    : [node];
}
export function inspectOfficeTemplate(
  bytes: Uint8Array,
  expectedFormat?: 'docx' | 'pptx',
): TemplateManifest {
  const files = openOfficePackage(bytes);
  let format: 'docx' | 'pptx' | undefined;
  if (files['word/document.xml']) format = 'docx';
  else if (files['ppt/presentation.xml']) format = 'pptx';
  if (!format || (expectedFormat && format !== expectedFormat))
    throw new Error('模板文件内容与格式不一致');
  const root = readXml(
    files,
    format === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml',
  );
  if (
    !root.documentElement ||
    root.documentElement.namespaceURI !== (format === 'docx' ? NS.w : NS.p) ||
    (format === 'docx' && children(root, NS.w, 'body').length === 0)
  )
    throw new Error('模板主文档结构无效');
  const parts =
    format === 'docx'
      ? [
          'word/document.xml',
          ...Object.keys(files).filter((name) =>
            /^word\/(header|footer)\d+\.xml$/u.test(name),
          ),
        ]
      : slideParts(files);
  if (parts.length > 60) throw new Error('模板页数过多，最多支持 60 个版式页');
  const fonts = new Set<string>();
  const elements: TemplateElement[] = [];
  const styleDoc = files['word/styles.xml']
    ? readXml(files, 'word/styles.xml')
    : undefined;
  if (styleDoc)
    for (const node of children(styleDoc, NS.w, 'rFonts')) {
      const font =
        node.getAttributeNS(NS.w, 'eastAsia') ||
        node.getAttributeNS(NS.w, 'ascii');
      if (font) fonts.add(font);
    }
  for (const [partIndex, part] of parts.entries()) {
    const doc = readXml(files, part);
    for (const node of children(doc, NS.w, 'rFonts')) {
      const font =
        node.getAttributeNS(NS.w, 'eastAsia') ||
        node.getAttributeNS(NS.w, 'ascii');
      if (font) fonts.add(font);
    }
    for (const name of ['latin', 'ea'])
      for (const node of children(doc, NS.a, name)) {
        const font = node.getAttribute('typeface');
        if (font) fonts.add(font);
      }
    for (const [index, node] of elementNodes(doc, format).entries()) {
      const text = textOf(node, format);
      const picture =
        node.localName === 'pic' || children(node, NS.w, 'drawing').length > 0;
      if (!text.trim() && !picture) continue;
      const candidates =
        format === 'pptx' ? shapeDefaults(files, part, node) : [node];
      const extent = candidates
        .map(
          (shape) =>
            children(shape, NS.wp, 'extent')[0] ??
            children(shape, NS.a, 'ext')[0],
        )
        .find(Boolean);
      const off = candidates
        .map((shape) => children(shape, NS.a, 'off')[0])
        .find(Boolean);
      const width = Number(extent?.getAttribute('cx') ?? 0);
      const height = Number(extent?.getAttribute('cy') ?? 0);
      const run = candidates
        .map(
          (shape) =>
            children(shape, NS.a, 'rPr')[0] ??
            children(shape, NS.a, 'defRPr')[0],
        )
        .find((item) => item?.hasAttribute('sz'));
      const wordStyle = children(node, NS.w, 'pStyle')[0]?.getAttributeNS(
        NS.w,
        'val',
      );
      const matchedStyle =
        styleDoc &&
        children(styleDoc, NS.w, 'style').find(
          (item) => item.getAttributeNS(NS.w, 'styleId') === wordStyle,
        );
      const wordSize =
        children(node, NS.w, 'sz')[0] ??
        (matchedStyle && children(matchedStyle, NS.w, 'sz')[0]) ??
        (styleDoc &&
          children(styleDoc, NS.w, 'docDefaults').flatMap((item) =>
            children(item, NS.w, 'sz'),
          )[0]);
      const fontSize =
        format === 'pptx'
          ? Number(run?.getAttribute('sz') ?? 1800) / 100
          : Number(wordSize?.getAttributeNS(NS.w, 'val') ?? 24) / 2;
      const maxChars =
        format === 'pptx'
          ? Math.max(
              10,
              Math.min(
                6000,
                Math.floor(
                  (width / 12_700 / fontSize) *
                    (height / 12_700 / fontSize / 1.35) *
                    0.8,
                ),
              ),
            )
          : 30_000;
      let unsupportedReason = '';
      if (
        format === 'docx' &&
        ['fldChar', 'instrText', 'sdt', 'object'].some(
          (name) => children(node, NS.w, name).length > 0,
        )
      )
        unsupportedReason = '复杂域或内容控件需在原模板中改成独立普通文本段落';
      for (
        let parent = node.parentNode;
        parent && parent.nodeType !== 9;
        parent = parent.parentNode
      ) {
        if (format === 'pptx' && parent.localName === 'grpSp')
          unsupportedReason = '需要编辑的组合图形请先在 PowerPoint 中取消组合';
        if (format === 'docx' && parent.localName === 'sdt')
          unsupportedReason = '受保护内容控件不支持替换，请使用普通文本段落';
        if (
          format === 'docx' &&
          parent.localName === 'tr' &&
          children(parent as Element, NS.w, 'trHeight').some(
            (height) => height.getAttributeNS(NS.w, 'hRule') === 'exact',
          )
        )
          unsupportedReason = '需要编辑的表格行请将行高改为自动或最小值';
      }
      elements.push({
        ...(unsupportedReason ? { unsupportedReason } : {}),
        ...(format === 'pptx' ? { pageNumber: partIndex + 1 } : {}),
        id: `${part}:${index}`,
        part,
        index,
        kind: picture ? 'image' : 'text',
        text: text.slice(0, 1000),
        ...inferredRole(text),
        fontSize,
        width,
        height,
        x: Number(off?.getAttribute('x') ?? 0),
        y: Number(off?.getAttribute('y') ?? 0),
        maxChars,
      });
    }
  }
  if (elements.length === 0)
    throw new Error('模板中没有支持的文本段落或图片位置');
  if (elements.length > 500)
    throw new Error('模板包含过多内容块，请精简后上传');
  return {
    format,
    elements,
    fonts: [...fonts],
    pageCount: format === 'pptx' ? parts.length : 1,
    warnings: elements.some((item) => item.role !== 'fixed')
      ? []
      : [
          '未发现占位符，请在下方指定需要填入标题、正文或图片的位置；其余内容会保持原样。',
        ],
  };
}

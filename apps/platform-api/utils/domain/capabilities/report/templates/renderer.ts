import type { Element, Node } from '@xmldom/xmldom';

import type {
  RenderReportInput,
  ReportArtifact,
  ReportImageAsset,
} from '../renderer';
import type { TemplateSnapshot } from './repository';
import type { TemplateBinding, TemplateElement } from './schema';

import { imageSize } from 'image-size';

import { ApiError } from '../../../../response';
import { reportMimeType, safeReportFilename } from '../schema';
import {
  children,
  closeOfficePackage,
  elementNodes,
  NS,
  openOfficePackage,
  readXml,
  slideParts,
  writeXml,
  xml,
} from './package';
/* oxlint-disable unicorn/prefer-dom-node-append, unicorn/prefer-dom-node-remove, unicorn/prefer-modern-dom-apis, unicorn/prefer-spread -- @xmldom uses XML DOM Level 2 NodeLists and mutation APIs, not browser DOM convenience methods. */
import { requireTemplateValue } from './required';
function fail(message: string): never {
  throw new ApiError(400, 'REPORT_TEMPLATE_LAYOUT_INVALID', message);
}
const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const directChildren = (node: Node) =>
  Array.from(node.childNodes ?? []).filter(
    (item): item is Element => item.nodeType === 1,
  );
function paragraphNodes(node: Node): Element[] {
  if (node.nodeType !== 1) return [];
  const paragraphs = children(node as Element, NS.w, 'p');
  if (node.localName === 'p') paragraphs.unshift(node as Element);
  return paragraphs;
}
function fitsText(text: string, element: TemplateElement) {
  const lines = Math.max(
    1,
    Math.floor(
      (element.height || 0) / 12_700 / (element.fontSize || 18) / 1.35,
    ),
  );
  const columns = Math.max(1, Math.floor(element.maxChars / lines));
  const usedLines = text
    .split('\n')
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil([...line].length / columns)),
      0,
    );
  return text.length <= element.maxChars && usedLines <= lines;
}
function takeText(text: string, element: TemplateElement) {
  if (fitsText(text, element)) return text;
  let low = 0;
  let high = Math.min(text.length, element.maxChars);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fitsText(text.slice(0, middle), element)) low = middle;
    else high = middle - 1;
  }
  if (!low) fail('模板正文框尺寸不足，请扩大原模板中的正文框');
  const candidate = text.slice(0, low);
  const punctuation = Math.max(
    candidate.lastIndexOf('。'),
    candidate.lastIndexOf('；'),
    candidate.lastIndexOf('\n'),
  );
  return text.slice(0, punctuation >= low / 2 ? punctuation + 1 : low);
}
export function validateTemplateInput(
  snapshot: TemplateSnapshot,
  input: RenderReportInput['parameters'],
) {
  const { bindings, repeatSections } = snapshot.configuration;
  const elements = new Map(
    snapshot.manifest.elements.map((item) => [item.id, item]),
  );
  const roles = new Set(bindings.map((item) => item.role));
  for (const role of ['title', ...(input.summary ? ['summary'] : [])])
    if (!roles.has(role as TemplateBinding['role']))
      fail(
        `模板缺少${role === 'title' ? '报告标题' : '摘要'}位置，请先配置模板或清空相应输入`,
      );
  input.sections.forEach((section, index) => {
    const accepts = (role: TemplateBinding['role']) =>
      bindings.some(
        (binding) =>
          binding.role === role &&
          (repeatSections || binding.sectionIndex === index),
      );
    if (!accepts('section-title'))
      fail(`模板未配置第 ${index + 1} 章的标题位置`);
    if (section.body && !accepts('section-body'))
      fail(`模板未配置第 ${index + 1} 章的正文位置`);
    if (section.images.length > 0 && !accepts('images'))
      fail(`模板未配置第 ${index + 1} 章的图片位置，不能丢弃已选择的图片`);
    if (!repeatSections && snapshot.format === 'pptx') {
      const bodyCapacity = bindings
        .filter(
          (item) => item.role === 'section-body' && item.sectionIndex === index,
        )
        .reduce(
          (sum, binding) => sum + (elements.get(binding.id)?.maxChars ?? 0),
          0,
        );
      const slots = bindings.filter(
        (item) => item.role === 'images' && item.sectionIndex === index,
      ).length;
      if (section.body.length > bodyCapacity || section.images.length > slots)
        fail(`第 ${index + 1} 章超出版式容量，请启用按章节扩展页面或增加位置`);
    }
  });
}
/** Preserve paragraph properties and the first run's formatting; never shrink fonts. */
function setText(node: Element, value: string, format: 'docx' | 'pptx') {
  if (
    format === 'docx' &&
    ['fldChar', 'instrText', 'sdt', 'drawing', 'object'].some(
      (name) => children(node, NS.w, name).length > 0,
    )
  )
    fail(
      '可替换文本位置包含复杂域、内容控件或图片，请在原模板中使用独立的普通文本段落',
    );
  const doc = requireTemplateValue(node.ownerDocument);
  const namespace = format === 'docx' ? NS.w : NS.a;
  const prefix = format === 'docx' ? 'w' : 'a';
  const parent = format === 'docx' ? node : children(node, NS.p, 'txBody')[0];
  if (!parent) fail('该内容块不是可写文本框，请选择其他位置');
  const baseParagraph =
    format === 'docx' ? node : children(parent, NS.a, 'p')[0];
  const pPr =
    baseParagraph &&
    directChildren(baseParagraph).find((item) => item.localName === 'pPr');
  const rPr = children(node, namespace, 'rPr')[0];
  const lines = value.split('\n');
  const paragraphs = lines.map((line) => {
    const p = doc.createElementNS(namespace, `${prefix}:p`);
    if (pPr) p.appendChild(pPr.cloneNode(true));
    const r = doc.createElementNS(namespace, `${prefix}:r`);
    if (rPr) r.appendChild(rPr.cloneNode(true));
    const t = doc.createElementNS(namespace, `${prefix}:t`);
    t.setAttributeNS(
      'http://www.w3.org/XML/1998/namespace',
      'xml:space',
      'preserve',
    );
    t.appendChild(doc.createTextNode(line));
    r.appendChild(t);
    p.appendChild(r);
    return p;
  });
  if (format === 'docx') {
    // Keep the paragraph node identity so repeated section mappings stay valid.
    for (const child of Array.from(node.childNodes)) node.removeChild(child);
    for (const child of Array.from(
      requireTemplateValue(paragraphs[0]).childNodes,
    ))
      node.appendChild(child);
    let after: Node = node;
    for (const p of paragraphs.slice(1)) {
      requireTemplateValue(node.parentNode).insertBefore(p, after.nextSibling);
      after = p;
    }
  } else {
    for (const p of children(parent, NS.a, 'p')) parent.removeChild(p);
    for (const p of paragraphs) parent.appendChild(p);
  }
}
function relPart(part: string) {
  const slash = part.lastIndexOf('/');
  return `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`;
}
export async function renderOfficeTemplate(
  input: RenderReportInput,
  snapshot: TemplateSnapshot,
  source: Uint8Array,
): Promise<ReportArtifact> {
  validateTemplateInput(snapshot, input.parameters);
  const files = openOfficePackage(source);
  const contentTypes = readXml(files, '[Content_Types].xml');
  const elements = new Map(
    snapshot.manifest.elements.map((item) => [item.id, item]),
  );
  const bindings = snapshot.configuration.bindings.filter(
    (item) => item.role !== 'fixed',
  );
  let nextId = 100_000;
  const mediaNames = new Map<string, string>();
  function ensureType(extension: string, mime: string) {
    if (
      children(contentTypes, NS.types, 'Default').some(
        (item) => item.getAttribute('Extension') === extension,
      )
    )
      return;
    const entry = contentTypes.createElementNS(NS.types, 'Default');
    entry.setAttribute('Extension', extension);
    entry.setAttribute('ContentType', mime);
    requireTemplateValue(contentTypes.documentElement).appendChild(entry);
  }
  function addImage(part: string, asset: ReportImageAsset) {
    const id = `railImage${++nextId}`;
    const extension = asset.mimeType === 'image/png' ? 'png' : 'jpg';
    const root = snapshot.format === 'docx' ? 'word' : 'ppt';
    const filename = mediaNames.get(asset.id) ?? `${id}.${extension}`;
    if (!mediaNames.has(asset.id)) {
      files[`${root}/media/${filename}`] = asset.bytes;
      mediaNames.set(asset.id, filename);
    }
    ensureType(extension, asset.mimeType);
    const path = relPart(part);
    const rels = files[path]
      ? readXml(files, path)
      : xml(`<Relationships xmlns="${NS.rel}"/>`);
    const rel = rels.createElementNS(NS.rel, 'Relationship');
    rel.setAttribute('Id', id);
    rel.setAttribute('Type', `${NS.r}/image`);
    rel.setAttribute(
      'Target',
      `${part === 'word/document.xml' ? '' : '../'}media/${filename}`,
    );
    requireTemplateValue(rels.documentElement).appendChild(rel);
    writeXml(files, path, rels);
    return id;
  }
  function fitImage(asset: ReportImageAsset, width: number, height: number) {
    const size = imageSize(asset.bytes);
    const ratio = Math.min(
      width / (size.width || 1),
      height / (size.height || 1),
    );
    return {
      width: Math.round((size.width || 1) * ratio),
      height: Math.round((size.height || 1) * ratio),
    };
  }
  function value(
    binding: TemplateBinding,
    sectionIndex: number,
    body?: string,
  ) {
    const section = input.parameters.sections[sectionIndex];
    switch (binding.role) {
      case 'section-body': {
        return body ?? section?.body ?? '';
      }
      case 'section-title': {
        return section?.title ?? '';
      }
      case 'summary': {
        return input.parameters.summary;
      }
      case 'title': {
        return input.parameters.title;
      }
      case 'value': {
        return input.parameters.templateValues?.[binding.fieldName] ?? '';
      }
      default: {
        return '';
      }
    }
  }
  function text(
    node: Element,
    binding: TemplateBinding,
    sectionIndex: number,
    body?: string,
  ) {
    const content = value(binding, sectionIndex, body);
    const element = requireTemplateValue(elements.get(binding.id));
    if (snapshot.format === 'pptx' && !fitsText(content, element))
      fail(
        `模板位置 ${element.index + 1}（${binding.role}）内容超出文本框，请减少文字或扩大原模板位置`,
      );
    setText(node, content, snapshot.format);
  }
  function wordImages(
    node: Element,
    binding: TemplateBinding,
    sectionIndex: number,
    captionStyle?: Element,
  ) {
    const section = input.parameters.sections[sectionIndex];
    if (!section) {
      requireTemplateValue(node.parentNode).removeChild(node);
      return;
    }
    const element = requireTemplateValue(elements.get(binding.id));
    const doc = requireTemplateValue(node.ownerDocument);
    const pPr = directChildren(node).find((item) => item.localName === 'pPr');
    const width = element.width || 5_486_400;
    const height = element.height || 3_657_600;
    for (const image of section.images) {
      const asset = input.assets.get(image.assetId);
      if (!asset) fail('模板图片不存在');
      const fit = fitImage(asset, width, height);
      const relationship = addImage('word/document.xml', asset);
      const id = ++nextId;
      const picture = requireTemplateValue(
        xml(
          `<w:p xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${fit.width}" cy="${fit.height}"/><wp:docPr id="${id}" name="Report image ${id}" descr="${escapeXml(image.caption || asset.name)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Image ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${fit.width}" cy="${fit.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`,
        ).documentElement,
      );
      const p = doc.importNode(picture, true) as Element;
      if (pPr) p.insertBefore(pPr.cloneNode(true), p.firstChild);
      requireTemplateValue(node.parentNode).insertBefore(p, node);
      if (image.caption) {
        const caption = (captionStyle ?? node).cloneNode(true) as Element;
        if (!captionStyle) {
          for (const drawing of children(caption, NS.w, 'drawing'))
            requireTemplateValue(drawing.parentNode).removeChild(drawing);
          let captionProperties = directChildren(caption).find(
            (item) => item.localName === 'pPr',
          );
          if (!captionProperties) {
            captionProperties = doc.createElementNS(NS.w, 'w:pPr');
            caption.insertBefore(captionProperties, caption.firstChild);
          }
          for (const keep of children(captionProperties, NS.w, 'keepNext'))
            requireTemplateValue(keep.parentNode).removeChild(keep);
          const keep = doc.createElementNS(NS.w, 'w:keepNext');
          keep.setAttributeNS(NS.w, 'w:val', '0');
          captionProperties.appendChild(keep);
        }
        requireTemplateValue(node.parentNode).insertBefore(caption, node);
        setText(caption, image.caption, 'docx');
      }
    }
    requireTemplateValue(node.parentNode).removeChild(node);
  }
  function pptImage(
    node: Element,
    element: TemplateElement,
    part: string,
    image?: {
      assetId: string;
      caption: string;
    },
  ) {
    if (!image) {
      requireTemplateValue(node.parentNode).removeChild(node);
      return;
    }
    const asset = input.assets.get(image.assetId);
    if (!asset) fail('模板图片不存在');
    const fit = fitImage(
      asset,
      requireTemplateValue(element.width),
      requireTemplateValue(element.height),
    );
    const x = Math.round(
      (element.x || 0) + (requireTemplateValue(element.width) - fit.width) / 2,
    );
    const y = Math.round(
      (element.y || 0) +
        (requireTemplateValue(element.height) - fit.height) / 2,
    );
    const id = ++nextId;
    const relation = addImage(part, asset);
    const pic = requireTemplateValue(
      xml(
        `<p:pic xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:nvPicPr><p:cNvPr id="${id}" name="Report image ${id}" descr="${escapeXml(image.caption || asset.name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relation}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${fit.width}" cy="${fit.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`,
      ).documentElement,
    );
    requireTemplateValue(node.parentNode).replaceChild(
      requireTemplateValue(node.ownerDocument).importNode(pic, true),
      node,
    );
  }
  if (snapshot.format === 'docx') {
    const docs = new Map(
      [...new Set(snapshot.manifest.elements.map((item) => item.part))].map(
        (part) => [part, readXml(files, part)],
      ),
    );
    const sourceNodes = new Map<string, Element>();
    for (const element of snapshot.manifest.elements)
      sourceNodes.set(
        element.id,
        requireTemplateValue(
          elementNodes(requireTemplateValue(docs.get(element.part)), 'docx')[
            element.index
          ],
        ),
      );
    const repeating = bindings.filter((item) =>
      ['image-caption', 'images', 'section-body', 'section-title'].includes(
        item.role,
      ),
    );
    const renderBindings = (
      pairs: Array<{
        binding: TemplateBinding;
        node: Element;
      }>,
      sectionIndex: number,
    ) => {
      const caption = pairs.find(
        (pair) => pair.binding.role === 'image-caption',
      )?.node;
      // Images and captions use cloned original styles before text slots are changed.
      for (const pair of pairs)
        if (pair.binding.role === 'images')
          wordImages(pair.node, pair.binding, sectionIndex, caption);
      for (const pair of pairs) {
        if (pair.binding.role === 'images') continue;
        if (pair.binding.role === 'image-caption') {
          pair.node.parentNode?.removeChild(pair.node);
          continue;
        }
        text(pair.node, pair.binding, sectionIndex);
      }
    };
    if (snapshot.configuration.repeatSections && repeating.length > 0) {
      const doc = requireTemplateValue(docs.get('word/document.xml'));
      const body = requireTemplateValue(children(doc, NS.w, 'body')[0]);
      const top = (node: Element) => {
        let current: Node = node;
        while (current.parentNode && current.parentNode !== body)
          current = current.parentNode;
        return current;
      };
      const blocks = Array.from(body.childNodes);
      const indices = repeating.map((binding) =>
        blocks.indexOf(top(requireTemplateValue(sourceNodes.get(binding.id)))),
      );
      if (indices.some((index) => index < 0))
        fail('循环章节位置必须位于 Word 主正文中');
      const start = Math.min(...indices);
      const end = Math.max(...indices);
      const region = blocks.slice(start, end + 1);
      if (
        region.some(
          (node) =>
            (node as Element).localName === 'sectPr' ||
            (node.nodeType === 1 &&
              children(node as Element, NS.w, 'sectPr').length > 0),
        )
      )
        fail('循环章节不能包含页节属性');
      if (
        bindings
          .filter((binding) => !repeating.includes(binding))
          .some((binding) =>
            region.includes(
              top(requireTemplateValue(sourceNodes.get(binding.id))),
            ),
          )
      )
        fail(
          '循环章节区域中不能包含报告标题、摘要或全局字段，请将这些位置移到章节区域之外',
        );
      if (
        region.some(
          (node) =>
            node.nodeType === 1 &&
            [
              'bookmarkStart',
              'commentRangeStart',
              'footnoteReference',
              'endnoteReference',
            ].some((name) => children(node as Element, NS.w, name).length > 0),
        )
      )
        fail(
          '循环章节含书签、批注或脚注引用，请关闭自动扩展并分别指定章节位置',
        );
      const anchor = blocks[end + 1] ?? null;
      for (const [sectionIndex] of input.parameters.sections.entries()) {
        const mapping = new Map<Element, Element>();
        for (const original of region) {
          const clone = original.cloneNode(true);
          const originalParagraphs = paragraphNodes(original);
          const cloneParagraphs = paragraphNodes(clone);
          originalParagraphs.forEach((p, index) =>
            mapping.set(p, requireTemplateValue(cloneParagraphs[index])),
          );
          if (clone.nodeType === 1)
            for (const drawing of children(clone as Element, NS.wp, 'docPr'))
              drawing.setAttribute('id', String(++nextId));
          body.insertBefore(clone, anchor);
        }
        renderBindings(
          repeating.map((binding) => ({
            binding,
            node: requireTemplateValue(
              mapping.get(requireTemplateValue(sourceNodes.get(binding.id))),
            ),
          })),
          sectionIndex,
        );
      }
      for (const original of region) body.removeChild(original);
    } else {
      for (const index of new Set(repeating.map((item) => item.sectionIndex)))
        renderBindings(
          repeating
            .filter((item) => item.sectionIndex === index)
            .map((binding) => ({
              binding,
              node: requireTemplateValue(sourceNodes.get(binding.id)),
            })),
          index,
        );
    }
    for (const binding of bindings.filter((item) => !repeating.includes(item)))
      text(requireTemplateValue(sourceNodes.get(binding.id)), binding, 0);
    for (const [part, doc] of docs) writeXml(files, part, doc);
  } else {
    const sourceParts = slideParts(files);
    const presentation = readXml(files, 'ppt/presentation.xml');
    const rels = readXml(files, 'ppt/_rels/presentation.xml.rels');
    const list = requireTemplateValue(
      children(presentation, NS.p, 'sldIdLst')[0],
    );
    for (const child of Array.from(list.childNodes)) list.removeChild(child);
    for (const rel of children(rels, NS.rel, 'Relationship'))
      if (rel.getAttribute('Type') === `${NS.r}/slide`)
        requireTemplateValue(rel.parentNode).removeChild(rel);
    let slideNumber = Math.max(
      ...Object.keys(files).map((name) =>
        Number(/^ppt\/slides\/slide(\d+)\.xml$/u.exec(name)?.[1] ?? 0),
      ),
    );
    let pageCount = 0;
    const bodyOffsets = new Map<number, number>();
    const imageOffsets = new Map<number, number>();
    const captionOffsets = new Map<number, number>();
    const frames = sourceParts.map((part) => {
      const local = bindings.filter(
        (item) => elements.get(item.id)?.part === part,
      );
      const imageSlots = local.filter((item) => item.role === 'images').length;
      const bodyCapacity = local
        .filter((item) => item.role === 'section-body')
        .reduce(
          (sum, item) =>
            sum + requireTemplateValue(elements.get(item.id)).maxChars,
          0,
        );
      return {
        part,
        local,
        imageSlots,
        bodyCapacity,
        repeating: local.some((item) =>
          ['images', 'section-body', 'section-title'].includes(item.role),
        ),
      };
    });
    const repeatFrames = frames.filter((frame) => frame.repeating);
    const append = (
      frame: (typeof frames)[number],
      sectionIndex: number,
      body: string,
      images: Array<{
        assetId: string;
        caption: string;
      }>,
      repeated: boolean,
    ) => {
      if (++pageCount > 200) fail('生成页数超过 200 页，请拆分报告');
      const part = `ppt/slides/slide${++slideNumber}.xml`;
      const doc = readXml(files, frame.part);
      const nodes = elementNodes(doc, 'pptx');
      const sourceRel = relPart(frame.part);
      if (files[sourceRel]) {
        const slideRels = readXml(files, sourceRel);
        for (const relation of children(slideRels, NS.rel, 'Relationship'))
          if (relation.getAttribute('Type') === `${NS.r}/notesSlide`)
            requireTemplateValue(relation.parentNode).removeChild(relation);
        writeXml(files, relPart(part), slideRels);
      }
      let remaining = body;
      let imageIndex = 0;
      let captionIndex = 0;
      for (const binding of frame.local) {
        const element = requireTemplateValue(elements.get(binding.id));
        const node = requireTemplateValue(nodes[element.index]);
        const currentIndex = repeated ? sectionIndex : binding.sectionIndex;
        const currentSection = input.parameters.sections[currentIndex];
        if (binding.role === 'images') {
          const position = repeated
            ? imageIndex++
            : (imageOffsets.get(currentIndex) ?? 0);
          pptImage(
            node,
            element,
            part,
            repeated ? images[position] : currentSection?.images[position],
          );
          if (!repeated) imageOffsets.set(currentIndex, position + 1);
        } else if (binding.role === 'section-body') {
          const offset = bodyOffsets.get(currentIndex) ?? 0;
          const chunk = repeated
            ? takeText(remaining, element)
            : (currentSection?.body ?? '').slice(
                offset,
                offset + element.maxChars,
              );
          if (repeated) remaining = remaining.slice(element.maxChars);
          else bodyOffsets.set(currentIndex, offset + element.maxChars);
          text(node, binding, currentIndex, chunk);
        } else if (binding.role === 'image-caption') {
          const position = repeated
            ? captionIndex++
            : (captionOffsets.get(currentIndex) ?? 0);
          const caption =
            (repeated ? images[position] : currentSection?.images[position])
              ?.caption ?? '';
          if (!repeated) captionOffsets.set(currentIndex, position + 1);
          if (!fitsText(caption, element))
            fail('图片说明超出模板说明框，请缩短说明或扩大模板文本框');
          setText(node, caption, 'pptx');
        } else text(node, binding, currentIndex);
      }
      writeXml(files, part, doc);
      const id = `railSlide${slideNumber}`;
      const relationship = rels.createElementNS(NS.rel, 'Relationship');
      relationship.setAttribute('Id', id);
      relationship.setAttribute('Type', `${NS.r}/slide`);
      relationship.setAttribute('Target', `slides/slide${slideNumber}.xml`);
      requireTemplateValue(rels.documentElement).appendChild(relationship);
      const slide = presentation.createElementNS(NS.p, 'p:sldId');
      slide.setAttribute('id', String(256 + pageCount));
      slide.setAttributeNS(NS.r, 'r:id', id);
      list.appendChild(slide);
      const override = contentTypes.createElementNS(NS.types, 'Override');
      override.setAttribute('PartName', `/${part}`);
      override.setAttribute(
        'ContentType',
        'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
      );
      requireTemplateValue(contentTypes.documentElement).appendChild(override);
    };
    let expanded = false;
    for (const frame of frames) {
      if (!snapshot.configuration.repeatSections || !frame.repeating) {
        append(frame, 0, '', [], false);
        continue;
      }
      if (expanded) continue;
      expanded = true;
      for (const [
        sectionIndex,
        section,
      ] of input.parameters.sections.entries()) {
        let remaining = section.body.trim();
        let imagePosition = 0;
        let first = true;
        while (first || remaining || imagePosition < section.images.length) {
          first = false;
          const imagesLeft = section.images.length - imagePosition;
          let candidates = repeatFrames.filter((candidate) => {
            if (remaining && imagesLeft > 0)
              return candidate.bodyCapacity > 0 && candidate.imageSlots > 0;
            if (remaining) return candidate.bodyCapacity > 0;
            if (imagesLeft > 0) return candidate.imageSlots > 0;
            return true;
          });
          if (candidates.length === 0)
            candidates = repeatFrames.filter(
              (candidate) =>
                (remaining && candidate.bodyCapacity > 0) ||
                (imagesLeft && candidate.imageSlots > 0),
            );
          const chosen = candidates.toSorted((left, right) => {
            if (remaining && !imagesLeft)
              return (
                (left.imageSlots > 0 ? 1 : 0) -
                  (right.imageSlots > 0 ? 1 : 0) ||
                right.bodyCapacity - left.bodyCapacity
              );
            if (!remaining && imagesLeft)
              return (
                (left.bodyCapacity > 0 ? 1 : 0) -
                  (right.bodyCapacity > 0 ? 1 : 0) ||
                (left.imageSlots > imagesLeft ? 1 : 0) -
                  (right.imageSlots > imagesLeft ? 1 : 0) ||
                (left.imageSlots <= imagesLeft && right.imageSlots <= imagesLeft
                  ? right.imageSlots - left.imageSlots
                  : left.imageSlots - right.imageSlots)
              );
            const overflowDifference =
              (left.imageSlots > imagesLeft ? 1 : 0) -
              (right.imageSlots > imagesLeft ? 1 : 0);
            if (overflowDifference) return overflowDifference;
            const imageDifference =
              left.imageSlots <= imagesLeft && right.imageSlots <= imagesLeft
                ? right.imageSlots - left.imageSlots
                : left.imageSlots - right.imageSlots;
            return imageDifference || right.bodyCapacity - left.bodyCapacity;
          })[0];
          if (!chosen) fail('模板缺少能够承载剩余正文或图片的版式');
          let available = remaining;
          for (const binding of chosen.local.filter(
            (item) => item.role === 'section-body',
          ))
            available = available.slice(
              takeText(
                available,
                requireTemplateValue(elements.get(binding.id)),
              ).length,
            );
          const chunk = remaining.slice(0, remaining.length - available.length);
          const pageImages = section.images.slice(
            imagePosition,
            imagePosition + chosen.imageSlots,
          );
          append(chosen, sectionIndex, chunk, pageImages, true);
          remaining = remaining.slice(chunk.length).trim();
          imagePosition += pageImages.length;
          if (!chunk && pageImages.length === 0) break;
        }
      }
    }
    writeXml(files, 'ppt/presentation.xml', presentation);
    writeXml(files, 'ppt/_rels/presentation.xml.rels', rels);
  }
  if (snapshot.format === 'docx') {
    const path = 'word/settings.xml';
    const settings = files[path]
      ? readXml(files, path)
      : xml(`<w:settings xmlns:w="${NS.w}"/>`);
    for (const previous of children(settings, NS.w, 'updateFields'))
      requireTemplateValue(previous.parentNode).removeChild(previous);
    const refresh = settings.createElementNS(NS.w, 'w:updateFields');
    refresh.setAttributeNS(NS.w, 'w:val', 'true');
    requireTemplateValue(settings.documentElement).appendChild(refresh);
    if (!files[path]) {
      const relationshipsPath = 'word/_rels/document.xml.rels';
      const relationships = files[relationshipsPath]
        ? readXml(files, relationshipsPath)
        : xml(`<Relationships xmlns="${NS.rel}"/>`);
      const relationship = relationships.createElementNS(
        NS.rel,
        'Relationship',
      );
      relationship.setAttribute('Id', 'railSettings');
      relationship.setAttribute('Type', `${NS.r}/settings`);
      relationship.setAttribute('Target', 'settings.xml');
      requireTemplateValue(relationships.documentElement).appendChild(
        relationship,
      );
      writeXml(files, relationshipsPath, relationships);
      const override = contentTypes.createElementNS(NS.types, 'Override');
      override.setAttribute('PartName', '/word/settings.xml');
      override.setAttribute(
        'ContentType',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml',
      );
      requireTemplateValue(contentTypes.documentElement).appendChild(override);
    }
    writeXml(files, path, settings);
  }
  writeXml(files, '[Content_Types].xml', contentTypes);
  return {
    bytes: closeOfficePackage(files),
    filename: safeReportFilename(input.parameters.title, snapshot.format),
    mimeType: reportMimeType(snapshot.format),
  };
}

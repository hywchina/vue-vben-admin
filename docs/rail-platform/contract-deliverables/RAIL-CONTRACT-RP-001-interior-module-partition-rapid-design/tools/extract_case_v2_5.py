"""Extract existing case evidence without running inference or changing pixels."""
import base64
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
# Allow relocating the project directory; the sibling checkout is the source.
COMFY = ROOT.parents[4] / 'ComfyUI'
OUT = ROOT / 'assets/v2-5/case'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    inputs = []
    for number in [196, 198]:
        source = COMFY / 'output' / f'Flux2-Klein_{number:05}_.png'
        im = Image.open(source)
        graph = json.loads(im.info['prompt'])
        mark = next(n['inputs'] for n in graph.values() if n['class_type'] == 'IO_EasyMark')
        stack = next(n['inputs'] for n in graph.values() if n['class_type'] == 'sum_stack_flux2_Klein')
        inputs.append(mark)
        clean = OUT / f'result-{number}.png'
        # Re-encode only to remove embedded workflow metadata; pixel bytes stay identical.
        im.save(clean)
        assert Image.open(clean).tobytes() == im.tobytes()
        rows.append({
            'source': str(source), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'figure': str(clean.relative_to(ROOT)), 'figure_sha256': hashlib.sha256(clean.read_bytes()).hexdigest(),
            'pixels_unchanged': True, 'size': im.size, 'instruction': stack['prompt'], 'graph': graph,
        })
    assert inputs[0] == inputs[1], 'Cases must share identical image and brush data'
    raw = base64.b64decode(inputs[0]['image_base64'].split(',', 1)[1])
    original = Image.open(io.BytesIO(raw))
    target = OUT / 'input.png'
    original.save(target)
    assert Image.open(target).tobytes() == original.tobytes()
    # Preserve the graph for reproducible internal analysis; no image payload is duplicated.
    for row in rows:
        for node in row['graph'].values():
            if node['class_type'] == 'IO_EasyMark':
                node['inputs']['image_base64'] = 'case/input.png'
    record = {
        'same_input_and_brush_data': True, 'input_figure': 'assets/v2-5/case/input.png',
        'input_sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'input_pixel_preserved': True, 'cases': rows,
        'limits': 'Existing archived outputs; no timing, reviewer rating or automatic recognition measurement.',
    }
    (ROOT / 'source/CASE_EVIDENCE_V2.5.json').write_text(json.dumps(record, ensure_ascii=False, indent=2))
    print('case extraction: identical source image and marks; pixels preserved')


if __name__ == '__main__':
    main()

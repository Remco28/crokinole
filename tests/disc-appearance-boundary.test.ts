import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const release = '425b35eb3a73663e55c1210deda8e0d821c0f827';
const baseline = (path: string) => execFileSync('git', ['show', `${release}:${path}`], { encoding: 'utf8' });
const source = (path: string) => readFileSync(path, 'utf8');
function declaration(text: string, name: string) {
  const file = ts.createSourceFile('scene.ts', text, ts.ScriptTarget.ES2020, true);
  let result = '';
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file); if (!result) throw new Error(`Missing function ${name}`); return result;
}
describe('disc designs preserve the accepted preview-8 game', () => {
  it('keeps every physics, rule, input, audio, board artwork and camera-orbit module byte-exact', () => {
    const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', release, 'src'], { encoding: 'utf8' }).trim().split('\n')
      .filter(p => !['src/main.ts', 'src/style.css', 'src/render/scene.ts'].includes(p));
    expect(paths.length).toBe(16);
    for (const path of paths) expect(source(path), path).toBe(baseline(path));
  });
  it('adds only disc settings initialization to main; gameplay handlers/clock/storage remain exact', () => {
    const current = source('src/main.ts')
      .replace("import { setupDiscSettings } from './disc-settings';\n", '')
      .replace('setupDiscSettings(scene);\n', '');
    expect(current).toBe(baseline('src/main.ts'));
  });
  it('preserves the complete rounded disc geometry, camera, picking and render timing functions', () => {
    for (const name of ['makeDiscGeometry', 'placeCamera', 'boardPoint', 'resize', 'tick'])
      expect(declaration(source('src/render/scene.ts'), name), name).toBe(declaration(baseline('src/render/scene.ts'), name));
  });
  it('removes the old inlay mesh and appends CSS without changing board/controls styles', () => {
    expect(/inlayGeo|inlayMaterial|mesh\.add\(inlay\)/.test(source('src/render/scene.ts'))).toBe(false);
    expect(source('src/style.css').startsWith(baseline('src/style.css'))).toBe(true);
  });
});

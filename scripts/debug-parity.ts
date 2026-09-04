import { parse } from '../src/parser/index.ts';

// Test dynamic layer constructor
const ast1 = parse("let l = PathLayer('x') #{ stroke: red; };");
const decl1 = ast1.body[0] as any;
console.log('=== Dynamic layer constructor ===');
console.log('type:', decl1.type, 'name:', decl1.name);
console.log('value type:', decl1.value?.type);
console.log('value layerType:', decl1.value?.layerType);
console.log('value name:', JSON.stringify(decl1.value?.name, (k: string, v: any) => k === 'loc' ? undefined : v));
console.log('value styleExpr:', decl1.value?.styleExpr?.type);

// Test undefined variable: draw pattern
console.log('\n=== fn draw() pattern ===');
const ast2 = parse("fn draw(x, y) {\n  circle(x, y, 10)\n}\nlet p = @{\n  draw(50, 50)\n};");
console.log('stmts:', ast2.body.map(s => s.type));
const fnDef = ast2.body[0] as any;
console.log('fn name:', fnDef.name, 'params:', fnDef.params);
const pathBlock = (ast2.body[1] as any).value;
console.log('path block body:', pathBlock?.body?.map((s: any) => s.type));
if (pathBlock?.body?.[0]) {
  const inner = pathBlock.body[0] as any;
  console.log('inner stmt:', JSON.stringify(inner, (k: string, v: any) => k === 'loc' ? undefined : v, 2).substring(0, 200));
}

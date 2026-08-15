const { esPremisaDeConsejo } = await import("../lib/ai/prompts.ts");
const casos = [
  ["como superar a mi ex novio", true],
  ["¿Cómo saber si te miente?", true],
  ["5 señales de que tu pareja te engaña", true],
  ["Qué hacer si tu jefe te humilla delante de todos", true],
  ["Por qué siempre vuelves con quien te lastimó", true],
  ["how to stop overthinking", true],
  ["Deja de perseguir a quien no te elige", true],
  // dramas normales — NO deben disparar
  ["Una mujer descubre que su esposo tiene otra familia", false],
  ["El día que mi hermana confesó en la boda", false],
  ["Un hombre pierde el camino de regreso al yate en una isla", false],
  ["Ella encontró el anillo en el bolsillo de él", false],
  ["Cuando abrió la puerta, ya era tarde", false],
  ["Nunca imaginé que mi mejor amiga fuera ella", false], // "Nunca" — trampa
];
let mal = 0;
for (const [t, esp] of casos) { const r = esPremisaDeConsejo({ topic: t }); if (r !== esp) mal++; console.log(`${r === esp ? "✓" : "❌"} ${r ? "CONSEJO " : "historia"}  ${t}`); }
console.log(mal ? `\n❌ ${mal} mal clasificada(s)` : "\n✅ detector correcto en todos");

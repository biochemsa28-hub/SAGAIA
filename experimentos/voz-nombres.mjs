const { similitudPorLinea } = await import("../services/quality/voz.ts");
const n = ["Marlene", "Iván", "Tamara"];
console.log("marlenin  ", similitudPorLinea(["Marlene, hace un año que no sé cómo decirte."], "Marlenin, hace un año que no sé cómo decirte.", n));
console.log("marlen    ", similitudPorLinea(["Marlene, hace un año que no sé cómo decirte."], "Marlen, hace un año que no sé cómo decirte.", n));
console.log("bien      ", similitudPorLinea(["Marlene, hace un año que no sé cómo decirte."], "Marlene hace un año que no se como decirte", n));
console.log("ivan ok   ", similitudPorLinea(["No me toques, Iván. No te atrevas."], "No me toques, Iván, ¿no? ¿Te atrevas?", n));
console.log("sin nombre", similitudPorLinea(["¿Cuánto tiempo?", "Yo puedo explicarte."], "¿Cuánto tiempo? Yo puedo explicarte.", n));

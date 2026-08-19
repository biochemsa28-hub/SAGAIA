const { numerosEnLetras } = await import("../services/quality/numeros.ts");
for (const t of ["Te vi en la foto, Osvaldo. La de 1962.","Llevamos 3 años y 2 meses.","Son las 7:30 y no llegó.","El 50% de las parejas.","Costó 1.500 pesos.","Mi 2ª oportunidad, el 1er día.","Hace 20 minutos. 100 veces te lo dije.","Sin números aquí."]) console.log(numerosEnLetras(t));

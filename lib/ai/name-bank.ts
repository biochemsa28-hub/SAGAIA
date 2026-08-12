// ─── Banco de nombres y vestuario ────────────────────────────────────────────
//
// Un modelo de lenguaje pedido "inventá un nombre en español" devuelve siempre
// los mismos: Valeria, Camila, Sofía, Mateo, Alejandro, Diego. No es un defecto
// del prompt — es el sesgo del entrenamiento, y ninguna instrucción de "sé
// original" lo vence de verdad. Se vence dándole MATERIAL: un puñado de nombres
// concretos, distintos en cada generación, entre los que elegir.
//
// Los nombres van separados por generación porque en América Latina la edad se
// nota en el nombre: una mujer de 70 se llama Rosario o Carmen, una de 20 se
// llama Antonella o Zoe. Un elenco con la abuela "Britany" se lee falso al
// instante, y esa clase de detalle es lo que separa un casting creíble de uno
// generado.

// ~120 por grupo × 200 apellidos = más de 100.000 combinaciones posibles.
const F_JOVEN = "Antonella Zoe Emilia Renata Ximena Danna Aitana Luciana Regina Fernanda Mia Julieta Alondra Abril Bianca Milagros Catalina Guadalupe Paulina Constanza Agustina Morena Delfina Amparo Jazmín Nayeli Itzel Ainhoa Maite Candela Miranda Rafaela Ivanna Dulce Alanis Briana Yamila Malena Priscila Anahí Thiare Antonia Josefina Trinidad Florencia Martina Isidora Amanda Javiera Fabiana Génesis Scarlet Keyla Yaretzi Citlali Xiomara Naomi Kiara Sarahí Nicol Yulissa Brisa Perla Estrella Marisol Azucena Jimena Ariadna Ivonne Lizbeth Marlene Nayla Elisa Ana Karol Michelle Melany Dayana Yeraldi Rubí Cielo Camelia Aurora Valentina Emma Olivia Sara Vera Noa Alba Lía Nara Irati Uma Ada Ivy Selena Alaia Amaia Nerea Ainara Leire Naia Idoia Garazi Nahia Enara Alazne Oihana Maddi Elai Ane Eider Iratxe Miren".split(" ");
const F_ADULTA = "Marcela Verónica Patricia Claudia Gabriela Adriana Mónica Silvia Carolina Alejandra Lorena Sandra Karina Vanessa Paola Diana Andrea Natalia Viviana Roxana Yolanda Elena Beatriz Cecilia Norma Susana Miriam Leticia Araceli Guadalupe Rocío Maribel Nancy Erika Wendy Perla Lourdes Griselda Magdalena Alba Ruth Ingrid Jessica Liliana Marisela Xochitl Blanca Aurora Estela Consuelo Amparo Dolores Milagros Nidia Isabel Teresa Margarita Gloria Alicia Julia Raquel Ester Noemí Sonia Pilar Inés Rosana Belén Nuria Marta Eva Ángela Sofía Irene Rebeca Débora Judith Priscila Damaris Keila Zulema Yamileth Marielos Xiomara Digna Aracely Nubia Betzaida Idalia Maritza Delmy Reina Sarai Elsy Yesenia Iliana Migdalia Odalys Yanet Caridad Bárbara".split(" ");
const F_MAYOR = "Rosario Carmen Josefa Dolores Concepción Mercedes Ángeles Encarnación Purificación Remedios Socorro Refugio Soledad Asunción Visitación Candelaria Altagracia Eustaquia Bernarda Práxedes Filomena Petra Ramona Feliciana Gregoria Anastasia Eulalia Sabina Modesta Herminia Bonifacia Casimira Nicolasa Prudencia Serafina Genoveva Rufina Zoila Domitila Basilia Simona Hilaria Leocadia Paulina Tomasa Ignacia Fermina Marcelina Faustina Melitona Crescencia Onésima Timotea Saturnina Cleotilde Pastora Natividad Presentación Trinidad Epifanía Adoración".split(" ");

const M_JOVEN = "Thiago Benjamín Matías Santiago Emiliano Dylan Ian Liam Bastián Maxi Joaquín Facundo Bautista Lautaro Valentín Tomás Franco Agustín Ignacio Vicente Cristóbal Maximiliano Alonso Damián Axel Brayan Kevin Jonathan Yahir Alexis Ángel Uriel Leonel Emmanuel Josué Isaac Elian Gael Dante Ariel Nicolás Rodrigo Sebastián Martín Lucas Bruno Simón Milan Noah Ethan Aaron Adrián Eduardo Iker Izan Hugo Marc Pol Biel Nil Arnau Jan Unai Aitor Ander Eneko Iñaki Gorka Xabier Julen Asier Markel Oier Beñat Haritz Egoitz Mikel Aimar Peio Ekaitz".split(" ");
const M_ADULTO = "Alejandro Fernando Ricardo Javier Roberto Óscar Arturo Gerardo Marco Rubén Iván Hugo Raúl Mauricio Rolando Ernesto Salvador Octavio Efraín Rigoberto Wilmer Nelson Edgardo Aldo Fabián Cristian Gustavo Horacio Leandro Marcelo Néstor Osvaldo Ramiro Sergio Tadeo Ulises Wenceslao Aurelio Bernardo Camilo Dionisio Eleazar Fidel Genaro Hernán Isidro Jacinto Leonardo Maximino Norberto Onofre Porfirio Quintín Reinaldo Saturnino Teodoro Urbano Valentín Wilfredo Ismael Abelardo Baltasar Ceferino Domingo Eliseo Feliciano Gonzalo Heriberto Ildefonso Joaquín Lisandro Melquiades Nicanor".split(" ");
const M_MAYOR = "Ambrosio Anselmo Aristeo Bartolomé Bonifacio Casimiro Celedonio Crescencio Cipriano Dámaso Desiderio Eleuterio Epifanio Ezequiel Filiberto Florencio Fulgencio Gervasio Gumersindo Hermenegildo Higinio Hipólito Honorio Ignacio Inocencio Jeremías Justiniano Leoncio Longinos Macario Marcelino Nazario Nemesio Nicomedes Pancracio Pantaleón Patricio Peregrino Policarpo Prudencio Querubín Remigio Rufino Sabino Secundino Segismundo Serapio Severiano Sinforoso Telesforo Teófilo Tiburcio Timoteo Trinidad Venancio Vicente Zacarías Eulogio Evaristo Faustino".split(" ");

const APELLIDOS = "Restrepo Quintero Vallejo Zapata Ocampo Betancur Mejía Arango Cardona Escobar Gaviria Osorio Toro Villegas Agudelo Salazar Bedoya Loaiza Marulanda Grisales Montoya Tabares Ospina Hincapié Zuluaga Correa Álvarez Palacio Cadavid Uribe Echeverri Jaramillo Bustamante Londoño Piedrahíta Velásquez Duque Henao Giraldo Franco Muñoz Rendón Aguirre Isaza Posada Trujillo Naranjo Ríos Peláez Castaño Mazo Yepes Gallego Ceballos Cano Serna Puerta Molina Guzmán Barrera Nieto Lozano Rincón Prieto Chávez Solís Robledo Aguilar Cordero Villalobos Alfaro Rojas Segura Bonilla Espinoza Zamora Vega Mora Sandoval Calderón Cascante Umaña Solano Barrantes Quesada Retana Zúñiga Fallas Picado Ureña Alvarado Brenes Camacho Chinchilla Delgado Elizondo Fonseca Granados Hidalgo Jiménez Leiva Madrigal Navarro Obando Pacheco Quirós Rodríguez Sáenz Trejos Ugalde Valverde Zeledón Acuña Badilla Cerdas Durán Esquivel Fernández Guerrero Herrera Iglesias Juárez Lara Miranda Nava Ordóñez Peña Quintana Ramos Suárez Tapia Urbina Valdez Yáñez Zavala Anguiano Bracamontes Carrillo Dávalos Estrada Figueroa Galindo Huerta Ibarra Jasso Lerma Mondragón Nájera Olguín Pantoja Quiroz Rangel Saldaña Tinoco Urrutia Vidales Zermeño Andrade Bello Cifuentes Dorantes Escalante Fierro Galván Hurtado Iriarte Landeros Maldonado Nuncio Olmedo Portillo Quezada Robles Sotelo Terán Ulloa Villaseñor Zambrano Alcántara Barajas Cepeda Dueñas Espinal Farías Gamboa Higareda Izaguirre Lugo Melgar Noriega Ontiveros Padilla Rentería Sarmiento Tovar Urías Verdugo Zavaleta".split(" ");

// Ejes de vestuario. El casting decía "vestuario elegante" y salía siempre lo
// mismo: gabardina, suéter crema, camisa blanca. La ropa cuenta QUIÉN es alguien
// —de qué vive, de dónde viene, qué década— y ese es el detalle que hace que un
// personaje parezca una persona y no un maniquí del estilo elegido.
const OFICIOS = [
  "enfermera de turno noche", "mecánico de barrio", "profesora de secundaria", "vendedora de mercado",
  "arquitecto en obra", "cocinera de fonda", "obrero de construcción", "peluquera", "taxista",
  "abogada joven", "panadero", "costurera", "policía fuera de servicio", "estudiante becada",
  "camarero de bar nocturno", "campesina", "contadora de oficina", "pescador", "veterinaria",
  "chofer de camión", "dueña de tienda de barrio", "músico callejero", "empleada doméstica",
  "empresario venido a menos", "repartidor en moto", "florista", "carpintero", "recepcionista de hotel",
];
const ORIGENES = [
  "recién llegada de un pueblo", "de familia adinerada venida a menos", "criado en la costa",
  "de clase media que aparenta más", "hija de migrantes", "de barrio popular con orgullo",
  "que estudió afuera y volvió", "que nunca salió de su ciudad", "de dinero nuevo y ostentoso",
  "de dinero viejo y discreto", "que creció en el campo", "de una familia numerosa",
];
const EPOCAS = ["hoy", "hoy", "hoy", "principios de los 2000", "los años 90", "los años 80", "época indefinida atemporal"];

// Los listados de arriba se escribieron a mano y a mano se cuelan dos cosas: un
// nombre repetido entre generaciones, y alguno de los que después prohibimos
// —ofrecer "Sofía" y en la línea siguiente prohibirla es una instrucción
// contradictoria, y el modelo resuelve esas como puede. Se limpia en código para
// que agregar nombres más adelante no vuelva a romperlo.
const PROHIBIDOS = new Set(
  "valeria camila sofia mateo alejandro diego lucia isabella santiago mariana daniel andres elena carlos ana luis maria jose"
    .split(" "),
);
const sinTilde = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function limpiar(...grupos: string[][]): string[][] {
  const vistos = new Set<string>();
  return grupos.map((g) =>
    g.filter((n) => {
      const k = sinTilde(n);
      if (PROHIBIDOS.has(k) || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    }),
  );
}
const [FJ, FA, FM] = limpiar(F_JOVEN, F_ADULTA, F_MAYOR) as [string[], string[], string[]];
const [MJ, MA, MM] = limpiar(M_JOVEN, M_ADULTO, M_MAYOR) as [string[], string[], string[]];
const APE = limpiar(APELLIDOS)[0]!;

// Toma n elementos al azar sin repetir.
function tomar<T>(arr: readonly T[], n: number): T[] {
  const copia = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copia.length; i++) out.push(...copia.splice(Math.floor(Math.random() * copia.length), 1));
  return out;
}

// Material fresco para UNA generación de casting. Se llama en cada proyecto, así
// que dos historias del mismo nicho no comparten elenco ni ropero.
export function materialDeCasting(): string {
  const nf = [...tomar(FJ, 6), ...tomar(FA, 6), ...tomar(FM, 3)];
  const nm = [...tomar(MJ, 6), ...tomar(MA, 6), ...tomar(MM, 3)];
  const ap = tomar(APE, 14);
  return (
    `━━━ MATERIAL PARA ESTE CASTING (usalo, no lo ignores) ━━━\n` +
    `NOMBRES DE MUJER disponibles: ${nf.join(", ")}\n` +
    `NOMBRES DE HOMBRE disponibles: ${nm.join(", ")}\n` +
    `APELLIDOS disponibles: ${ap.join(", ")}\n` +
    `ELIGE de estas listas y COMBINA nombre + apellido. Están ordenadas por generación: ` +
    `los primeros son de gente joven, los últimos de gente mayor — elegí el que corresponda a la edad del personaje. ` +
    `Una abuela no se llama como una adolescente.\n\n` +
    `EJES DE VESTUARIO para inspirarte (adaptalos a la premisa, no los copies literal):\n` +
    `- oficio posible: ${tomar(OFICIOS, 5).join(" · ")}\n` +
    `- origen social: ${tomar(ORIGENES, 4).join(" · ")}\n` +
    `- época: ${tomar(EPOCAS, 1)[0]}\n`
  );
}

// Nombres que el modelo repite sin que se los pidan. Se le prohíben para que
// tenga que ir a buscar al banco de arriba. Es la MISMA lista que se filtra del
// banco, para no ofrecer y prohibir lo mismo.
export const NOMBRES_QUEMADOS =
  "Valeria, Camila, Sofía, Mateo, Alejandro, Diego, Lucía, Isabella, Santiago, Mariana, Daniel, Andrés, Elena, Carlos, Ana, Luis, María, José";

// Solo para diagnóstico: cuánto material real quedó tras limpiar.
export function tamañoDelBanco() {
  const f = FJ.length + FA.length + FM.length;
  const m = MJ.length + MA.length + MM.length;
  return { mujeres: f, hombres: m, apellidos: APE.length, combinaciones: (f + m) * APE.length };
}

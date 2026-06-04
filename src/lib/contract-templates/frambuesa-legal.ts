/**
 * Texto legal del Contrato de Compraventa de Plantas (Viveros Hijuelas).
 *
 * ⚠️⚠️  IMPORTANTE — TEXTO TRANSCRITO DE UN PDF ESCANEADO  ⚠️⚠️
 * Las cláusulas boilerplate de abajo fueron transcritas desde "Contrato firmado.pdf"
 * (un scan sin capa de texto). PUEDE CONTENER ERRORES DE TRANSCRIPCIÓN. Antes de
 * usar en producción, REVISAR y reemplazar cada cláusula contra el .docx ORIGINAL
 * de legal. Esto NO es asesoría legal; validar con abogado.
 *
 * Las partes variables (partes, tablas de objeto/precio/royalty, forma de pago,
 * avisos) NO viven acá — se inyectan desde los datos del contrato en contract-pdf.ts.
 * Acá solo el boilerplate fijo + la configuración legal del vendedor.
 */

export const LEGAL_REVIEW_BANNER =
  "BORRADOR — texto legal pendiente de revisión contra el contrato original.";

/** Perfil legal del vendedor (datos fijos que el CRM no modela). Editable. */
export type SellerLegalProfile = {
  legalName: string;
  taxId: string;
  representativeName: string;
  representativeId: string; // cédula de identidad
  domicile: string;
  bankName: string;
  bankAccount: string;
  /** Contacto para notificaciones (cláusula OCTAVO). */
  noticeName: string;
  noticeEmail: string;
  noticeAddress: string;
};

/**
 * Perfil por defecto (placeholder). Los datos reales del vendedor viven en la
 * tabla `organizations` (columnas legales, migración 00037) y se editan en
 * /admin/organizaciones. Este default solo cubre campos faltantes.
 *
 * ⚠️ Verificar estos datos (cédula del representante, cuenta corriente, etc.).
 */
export const DEFAULT_SELLER_PROFILE: SellerLegalProfile = {
  legalName: "VIVEROS HIJUELAS S.A.",
  taxId: "96.835.510-4",
  representativeName: "Gaspar Goycoolea Vial",
  representativeId: "7.040.318-7",
  domicile: "Carretera Panamericana Norte Km 102, comuna de Hijuelas, Quinta Región",
  bankName: "Banco Crédito e Inversiones",
  bankAccount: "88130312",
  noticeName: "Marta Simon",
  noticeEmail: "jgoycoolea@grupohijuelas.com",
  noticeAddress: "Carretera Panamericana Norte Km 102, comuna de Hijuelas",
};

/** Datos legales de la organización vendedora (columnas de `organizations`). */
export type OrgLegalData = {
  name?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  legal_representative_name?: string | null;
  legal_representative_id?: string | null;
  legal_domicile?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  notice_name?: string | null;
  notice_email?: string | null;
};

/**
 * Construye el perfil legal del vendedor desde los datos de la organización.
 * Cada campo cae al DEFAULT solo si la org no lo tiene cargado.
 */
export function sellerProfileFromOrg(org: OrgLegalData): SellerLegalProfile {
  const d = DEFAULT_SELLER_PROFILE;
  return {
    legalName: org.legal_name ?? org.name ?? d.legalName,
    taxId: org.tax_id ?? d.taxId,
    representativeName: org.legal_representative_name ?? d.representativeName,
    representativeId: org.legal_representative_id ?? d.representativeId,
    domicile: org.legal_domicile ?? d.domicile,
    bankName: org.bank_name ?? d.bankName,
    bankAccount: org.bank_account ?? d.bankAccount,
    noticeName: org.notice_name ?? d.noticeName,
    noticeEmail: org.notice_email ?? d.noticeEmail,
    noticeAddress: org.legal_domicile ?? d.noticeAddress,
  };
}

/**
 * Cláusulas boilerplate (sin datos variables). Cada entrada es un título +
 * párrafos. El generador las intercala con las tablas/datos del contrato.
 * Numeración y orden replican el contrato original.
 */
export type LegalClause = { heading: string; paragraphs: string[] };

/** SEGUNDO (prose tras la tabla 2.1) + 2.2/2.3/2.4. */
export const CLAUSE_ENTREGA: LegalClause = {
  heading: "SEGUNDO: Condiciones de la entrega material.",
  paragraphs: [
    "La entrega de las Plantas se realizará mediante despachos parcializados en camión. VIVEROS HIJUELAS informará por escrito al COMPRADOR, con la debida anticipación, las fechas estimadas, las cuales se llevarán a cabo dentro del mes indicado, conforme a la programación que oportunamente se comunique al COMPRADOR.",
    "No obstante lo anterior, si las plantas se encuentran en condición óptima para su entrega con anterioridad a la fecha originalmente programada y el COMPRADOR solicita expresamente adelantar dicha entrega, VIVEROS HIJUELAS podrá acceder a dicha solicitud.",
    "Sin perjuicio de lo anterior, VIVEROS HIJUELAS manifiesta que el adelanto de la fecha de entrega puede eventualmente exponer a las plantas a factores climáticos adversos y determinantes para su desarrollo, tales como, a modo meramente ejemplar, heladas tardías, circunstancia que el COMPRADOR declara conocer y aceptar, asumiendo íntegramente el riesgo de cualquier evento o condición que pudiere generar un detrimento en el desarrollo de las plantas objeto del presente contrato.",
    "2.2. Lugar de entrega. Las plantas serán entregadas en despachos parcializados al comprador sobre camión, en instalaciones de VIVEROS HIJUELAS, es decir en Panamericana Norte Km 102, en la comuna de Hijuelas, Quinta Región.",
    "2.3. Formalidad de la entrega. El COMPRADOR, a través de un representante especialmente designado por escrito al efecto, estará presente durante el proceso de carga sobre camión y retiro de las Plantas. Su representante firmará la correspondiente Guía de Despacho, la cual luego de transcurridos 15 días calendario desde su firma, dará cuenta de los efectos legales, en acta de entrega que certificará la cantidad, formato, características y calidad de las Plantas entregadas por VIVEROS HIJUELAS y recibidas por el COMPRADOR, lo cual determinará su conformidad absoluta, final y definitiva sobre las características, especificaciones y condiciones de las plantas que no estén específicamente descritas y establecidas en la cláusula 2.4 siguiente.",
    "La o las actas de entrega que se suscriban se entenderán formar parte integrante del presente contrato y serán la prueba de haberse recibido conforme las plantas por el COMPRADOR. La eventual falta de personería del representante del COMPRADOR jamás podrá usarse como válido para desconocer la entrega de las plantas, ni su calidad o cantidad, como tampoco para impugnar la circunstancia de haberse recibido éstas conforme.",
    "2.4. Especificaciones de calidad de las Plantas. VIVEROS HIJUELAS entregará las Plantas en los siguientes términos y condiciones: 1.- Plantas uniformes, de buena calidad y libres de maleza. 2.- Plantadas en maceteros de 50 alvéolos de volumen 70 cc cada uno, de origen in vitro. 3.- Plantas con una masa radicular activa a la mata y abarcando al menos el 80% del volumen del pote. 4.- Plantas con una altura mínima de 8 cms y una altura máxima de 10 cms, todas carentes de síntomas de problemas fitosanitarios o fitotoxicidad y con todos sus órganos en perfecto estado. La altura de las Plantas no será de un buen tamaño en caso de solicitarlo el COMPRADOR, lo que deberá ser realizado por escrito, en alguna de las formas autorizadas en la cláusula octava del presente contrato. 5.- Plantas sin presencia de plagas.",
    "Sólo en el supuesto caso que alguna o algunas de las plantas no presentaran los parámetros estipulados anteriormente y que pueda demostrarse de manera fehaciente y bajo un método científico que dicho problema es atribuible únicamente a VIVEROS HIJUELAS, estas plantas serán repuestas sin costo para EL COMPRADOR, debiendo EL COMPRADOR retirarlas en el lugar establecido en la cláusula 2.2 de este instrumento, previa coordinación con VIVEROS HIJUELAS.",
    "En el evento que, dentro de los primeros 6 (seis) meses contados desde la fecha de entrega de las plantas, el COMPRADOR detecte la existencia de un problema fitosanitario oculto no visible al momento de la entrega, tendrá la facultad de objetar por escrito las plantas presuntamente afectadas, debiendo comunicar dicha situación a VIVEROS HIJUELAS dentro de un plazo de 48 horas desde su detección.",
    "Recibida la objeción, el equipo de VIVEROS HIJUELAS concurrirá a auditar las plantas objetadas y a realizar el diagnóstico técnico correspondiente. En caso de que dicho diagnóstico determine de manera fundada que el problema fitosanitario es imputable a VIVEROS HIJUELAS, se procederá a la reposición de las plantas objetadas, en los términos y condiciones que se acordaren entre las partes.",
    "En caso contrario, si el diagnóstico concluye que el problema no es atribuible a VIVEROS HIJUELAS, el COMPRADOR asumirá íntegramente los riesgos y costos asociados, sin que proceda reposición alguna.",
    "VIVEROS HIJUELAS se obliga a retirar las Plantas dentro de los plazos estipulados. En caso de retrasos en el retiro de las Plantas, VIVEROS HIJUELAS no se responsabilizará por la calidad de las plantas, especialmente en lo que se refiere a las raíces de las plantas (2.4). Se entiende que el retraso en el retiro de las Plantas será cualquier retiro posterior a la fecha acordada por las partes a que se refiere la cláusula 4.1.",
    "El COMPRADOR declara conocer y aceptar que las plantas objeto de la compraventa a que se refiere el presente instrumento serán sometidas, previa a su entrega, a un proceso de aclimatación progresiva en vivero, destinado a favorecer su adaptación a condiciones ambientales externas y a su posterior establecimiento en campo.",
  ],
};

export const CLAUSE_GARANTIA: LegalClause = {
  heading: "TERCERO: Garantía y renuncia de acciones.",
  paragraphs: [
    "Salvo por la responsabilidad que pudiere caber a VIVEROS HIJUELAS por algún problema fitosanitario de las plantas, de acuerdo con lo establecido en la cláusula 2.4, las partes acuerdan que VIVEROS HIJUELAS no será responsable ni otorga garantía alguna sobre el resultado productivo, comerciabilidad o aptitud de las plantas objeto del presente contrato. En consecuencia, el COMPRADOR expresamente renuncia a ejercer en contra de VIVEROS HIJUELAS, cualquiera fuera su origen, naturaleza o denominación, que pudiera ejercer en contra de VIVEROS HIJUELAS, derivada del resultado productivo, comerciabilidad o aptitud de las Plantas y de su frutos para los fines convenidos en este contrato.",
  ],
};

export const CLAUSE_DESISTIMIENTO: LegalClause = {
  heading: "QUINTO: Desistimiento por parte del Comprador.",
  paragraphs: [
    "5.1. Si el COMPRADOR se desistiere de la compra, en cualquier momento, deberá pagar igualmente a VIVEROS HIJUELAS los perjuicios que dicho desistimiento ocasionase, los cuales las partes acuerdan anticipadamente en la cantidad equivalente al 100% del precio total de las Plantas comprometidas. El presente instrumento podrá servir, en este caso, de suficiente título ejecutivo, en que se verifique el desistimiento, quien queda expresamente facultado de pleno derecho para retener el 100% del adelanto a título de avaluación anticipada de indemnización de perjuicios.",
    "5.2. Si el COMPRADOR se desistiera parcialmente de las Plantas comprometidas se aplicará lo estipulado en el número 5.1, según corresponda y solo exclusivamente respecto de las Plantas de las que se desista.",
    "5.3. Se deja constancia que las sumas mencionadas en los párrafos 5.1 y 5.2 será la cantidad a que VIVEROS HIJUELAS tendrá derecho a modo de indemnización por los perjuicios que la actuación del desistimiento del COMPRADOR, a título multa será sustitutiva y excluyente de cualquier otro derecho a indemnización de VIVEROS HIJUELAS en relación al desistimiento de las Plantas.",
  ],
};

export const CLAUSE_ARBITRAJE: LegalClause = {
  heading: "SEXTO: Arbitraje.",
  paragraphs: [
    "Cualquier dificultad que se produzca entre las partes, por cualquier motivo o circunstancia relacionada, directa o indirectamente, con el presente contrato, en especial, pero sin que la enunciación siguiente sea taxativa, sino meramente enunciativa, todas aquellas que digan relación con los efectos, vigencia, aplicación, interpretación, cumplimiento, incumplimiento, validez o invalidez, nulidad o resolución, existencia o inexistencia del presente contrato, deberán ser resueltas a través de un proceso de conciliación al que deberán someterse las partes.",
    "El proceso conciliatorio contendrá una etapa previa, en que cada parte propondrá sus pretensiones y argumentos por escrito, debiendo enviar un documento al efecto en carta certificada, a la contraparte. La recepcionaria tendrá un plazo de 10 días hábiles para evacuar su respuesta, la que deberá respetar las mismas formalidades. Con posterioridad a esto, en un plazo no superior a 10 días hábiles de recibida la respuesta, en el evento de no existir prórroga de común acuerdo entre las partes, los representantes de las mismas deberán intentar lograr un acuerdo en reunión verbal, el que de lograrse deberá constar por escrito y ser firmado ante notario en las partes de común acuerdo. En el evento de no lograrse acuerdo en un plazo no superior a 10 días hábiles de celebrada dicha reunión, dispondrá que podrá ser prorrogable de común acuerdo.",
    "De no producirse el acuerdo en los términos señalados precedentemente, transcurridos 20 días hábiles desde recibida la respuesta del documento, o de no existir prórroga pactada entre las partes, las dificultades a diferencias que se produzcan entre ellas serán resueltas por un árbitro arbitrador, conforme al Reglamento del Centro de Arbitrajes de la Cámara de Comercio de Santiago AG., cuyas disposiciones constan en la escritura pública de fecha 10 de Diciembre de 1992 otorgada en la Notaría de Santiago de don Sergio Rodríguez Garcés, que formará parte integrante de esta cláusula, las partes declaran conocer y aceptar.",
    "El árbitro será designado de común acuerdo por las partes y, a falta de él, será designado por la Cámara de Comercio de Santiago AG. En contra de las resoluciones del árbitro no procederá recurso alguno, por lo cual las partes renuncian expresamente a ellos. El árbitro queda especialmente facultado para resolver todo asunto relacionado con su competencia y/o jurisdicción.",
  ],
};

export const CLAUSE_VIGENCIA: LegalClause = {
  heading: "SÉPTIMO: Vigencia del contrato.",
  paragraphs: [
    "El presente contrato comenzará a regir a contar de esta fecha, surtiendo pleno efecto en todas sus partes, y manteniendo su vigencia hasta el cese de todas de las obligaciones y derechos que se hayan generado conforme a las disposiciones del presente contrato.",
  ],
};

export const CLAUSE_MODIFICACIONES: LegalClause = {
  heading: "DÉCIMO: Modificaciones al contrato.",
  paragraphs: [
    "Toda modificación total o parcial de las cláusulas o términos del presente contrato y sus anexos, sólo producirá sus efectos en la medida única y exclusiva de que ello haya sido previamente acordada por escrito por las partes.",
  ],
};

export const CLAUSE_EXIGIBILIDAD: LegalClause = {
  heading: "DÉCIMO PRIMERO: Exigibilidad de las obligaciones.",
  paragraphs: [
    "Las partes convienen en que la omisión, inactividad o negligencia en cualquier instancia o tiempo de hacer cumplir por una parte de alguna de ellas para exigir cumplimiento íntegro y oportuno de cualquier obligación emanada del presente contrato, no será considerado como renuncia ni privilegios otorgados por el presente contrato, no podrán ser jamás considerado como una renuncia o abdicación de tales derechos y privilegios para el caso de obligación ni resulta impedimento del ejercicio de derechos en el futuro.",
  ],
};

export const CLAUSE_INEFICACIA: LegalClause = {
  heading: "DÉCIMO SEGUNDO: Ineficacia de alguna cláusula y títulos.",
  paragraphs: [
    "Si por cualquier razón alguna disposición o estipulación de este contrato fuese declarada ineficaz, nula o ilegal, se tendrá por eliminada, sin que ello afecte la validez, legalidad y vigencia de las demás disposiciones.",
    "Las partes acuerdan dejar expresa constancia de que los títulos de cada cláusula son meramente referenciales, sin afectar de modo alguno la amplitud de los efectos y obligaciones que imponen.",
  ],
};

/** Cláusulas en el orden en que se renderizan tras la sección de precio/pago. */
export const TAIL_CLAUSES: LegalClause[] = [
  CLAUSE_DESISTIMIENTO,
  CLAUSE_ARBITRAJE,
  CLAUSE_VIGENCIA,
  CLAUSE_MODIFICACIONES,
  CLAUSE_EXIGIBILIDAD,
  CLAUSE_INEFICACIA,
];

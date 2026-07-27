import { redirect } from "next/navigation";

/**
 * Salidas se integró a /planner/movimientos como una de las tres pestañas
 * (Ingresos / Traslados / Salidas). Se mantiene la ruta para no romper links
 * ni marcadores existentes.
 */
export default function SalidasPage() {
  redirect("/planner/movimientos?tipo=salidas");
}

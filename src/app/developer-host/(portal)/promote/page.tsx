import { notFound } from "next/navigation";

// Paid plans and sponsored placements are not offered while Webcenta is free to use.
// The tables and admin tools remain for when they are launched.
export default function PromotePage() {
  notFound();
}

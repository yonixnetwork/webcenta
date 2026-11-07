import { notFound } from "next/navigation";

/** Unmatched public URLs render the branded 404 inside the public layout (status 404). */
export default function Missing() {
  notFound();
}

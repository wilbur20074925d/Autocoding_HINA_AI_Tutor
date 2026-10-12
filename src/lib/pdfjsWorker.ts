import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Worker built from the same pdfjs-dist install as the API. */
export const PDFJS_WORKER_SRC = pdfWorkerSrc;

export function applyPdfWorker(
  pdfjsLib: { GlobalWorkerOptions?: { workerSrc: string } } | null | undefined
) {
  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }
}

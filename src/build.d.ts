declare const __BUILD_ID__: string;

interface Window {
  __diagnosticsBoot?: { take(): { type: string; line: number; column: number }[] };
}

interface Window {
  __replay: any;
}

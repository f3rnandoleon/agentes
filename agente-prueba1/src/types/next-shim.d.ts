declare module "next" {
  export interface Metadata { title?: string; description?: string }
}
declare module "next/server" {
  export type NextRequest = Request & { nextUrl?: URL };
  export const NextResponse: any;
}

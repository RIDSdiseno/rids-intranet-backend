declare module "xlsx-populate" {
  export interface Cell {
    value(v?: any): any;
    relativeCell(rowOffset: number, colOffset: number): Cell;
  }

  export interface Sheet {
    cell(address: string | [number, number]): Cell;
    name(): string;
  }

  export interface Workbook {
    sheet(nameOrIndex: string | number): Sheet;
    outputAsync(type?: any): Promise<ArrayBuffer | Uint8Array | Buffer>;
  }

  const XlsxPopulate: {
    fromFileAsync(path: string): Promise<Workbook>;
    fromDataAsync(data: ArrayBuffer | Uint8Array | Buffer): Promise<Workbook>;
  };

  export type { Cell, Sheet, Workbook };
  export default XlsxPopulate;
}

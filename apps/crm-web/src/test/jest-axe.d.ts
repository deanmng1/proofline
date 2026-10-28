declare module "jest-axe" {
  export interface AxeResults {
    violations: unknown[];
    [key: string]: unknown;
  }

  export function axe(html: Element | string): Promise<AxeResults>;

  export const toHaveNoViolations: {
    toHaveNoViolations(results: AxeResults): { pass: boolean; message(): string };
  };
}

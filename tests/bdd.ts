// A very small Given/When/Then harness on top of `bun:test`.
//
// The point isn't ceremony — it's that a failing scenario tells you *which step*
// broke and in what state, instead of pointing at a bare assertion:
//
//   Scenario: a reader picks their own palette
//     ✗ When they choose the paper preset: expected "#b45309" to be "#7c3aed"
//
//   feature("Theming", () => {
//     scenario("a reader picks their own palette", (s) => {
//       s.given("the site default", () => { … });
//       s.when("they choose the paper preset", () => { … });
//       s.then("the accent follows the preset", () => { … });
//     });
//   });
import { describe, test } from "bun:test";

export type StepFn = () => void | Promise<void>;

class Steps {
  /** Steps recorded so far, for the failure message. */
  private trail: string[] = [];

  private async run(keyword: string, label: string, fn: StepFn): Promise<void> {
    const line = `${keyword} ${label}`;
    try {
      await fn();
      this.trail.push(`  ✓ ${line}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const context = this.trail.length ? `\n${this.trail.join("\n")}` : "";
      const failure = new Error(`${line}: ${message}${context}`);
      failure.stack = error instanceof Error ? error.stack : failure.stack;
      throw failure;
    }
  }

  given(label: string, fn: StepFn): Promise<void> {
    return this.run("Given", label, fn);
  }
  when(label: string, fn: StepFn): Promise<void> {
    return this.run("When", label, fn);
  }
  then(label: string, fn: StepFn): Promise<void> {
    return this.run("Then", label, fn);
  }
  and(label: string, fn: StepFn): Promise<void> {
    return this.run("And", label, fn);
  }
}

export function feature(name: string, body: () => void): void {
  describe(`Feature: ${name}`, body);
}

export function scenario(name: string, body: (steps: Steps) => void | Promise<void>): void {
  test(`Scenario: ${name}`, async () => {
    await body(new Steps());
  });
}

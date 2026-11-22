import { describe, expect, test } from "bun:test";
import { modalityName, modalityStored } from "./modality";

describe("portal modality names", () => {
  test("presets read in Thai and map back; own names and English stay", () => {
    expect(modalityName("Running", "th")).toBe("วิ่ง");
    expect(modalityName("cycling", "th")).toBe("ปั่นจักรยาน");
    expect(modalityName("Running", "en")).toBe("Running");
    expect(modalityName("Hill sprints", "th")).toBe("Hill sprints");
    expect(modalityStored("วิ่ง")).toBe("Running");
    expect(modalityStored(" ปั่นจักรยาน ")).toBe("Cycling");
    expect(modalityStored("Hill sprints")).toBe("Hill sprints");
  });
});

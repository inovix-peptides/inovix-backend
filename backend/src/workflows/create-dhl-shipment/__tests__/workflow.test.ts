jest.mock("@medusajs/framework/workflows-sdk", () => {
  const createStepMock = (_name: string, fn: any) => fn
  const createWorkflowMock = (_name: string, fn: any) => fn
  class StepResponse {
    constructor(public output: any) {}
  }
  class WorkflowResponse {
    constructor(public output: any) {}
  }
  return {
    createStep: createStepMock,
    createWorkflow: createWorkflowMock,
    StepResponse,
    WorkflowResponse,
  }
})

describe("createDhlShipmentWorkflow", () => {
  it("is importable and has the expected name", async () => {
    const mod = await import("..")
    expect(mod.createDhlShipmentWorkflow).toBeDefined()
    expect(typeof mod.createDhlShipmentWorkflow).toBe("function")
  })
})

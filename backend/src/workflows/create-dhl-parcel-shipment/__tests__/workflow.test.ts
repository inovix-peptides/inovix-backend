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

describe("createDhlParcelShipmentWorkflow", () => {
  it("is importable and is a valid workflow object", async () => {
    const mod = await import("..")
    expect(mod.createDhlParcelShipmentWorkflow).toBeDefined()
    expect(typeof mod.createDhlParcelShipmentWorkflow).toBe("function")
  })
})

import { describe, expect, it } from "vitest";
import {
  buildAgentAttentionNotificationPayload,
  findLatestAssistantMessageFromTimeline,
  findLatestPermissionRequest,
} from "./agent-attention-notification.js";

describe("buildAgentAttentionNotificationPayload", () => {
  it("carries the workspace needed to open a cold agent destination", () => {
    const payload = buildAgentAttentionNotificationPayload({
      reason: "finished",
      serverId: "srv-1",
      workspaceId: "workspace-1",
      agentId: "agent-1",
    });

    expect(payload.data).toEqual({
      serverId: "srv-1",
      workspaceId: "workspace-1",
      agentId: "agent-1",
      reason: "finished",
    });
  });

  it("builds finished notifications from markdown assistant text", () => {
    const payload = buildAgentAttentionNotificationPayload({
      reason: "finished",
      serverId: "srv-1",
      workspaceId: "workspace-1",
      agentId: "agent-1",
      assistantMessage: "**Done**. Updated `README.md` and [link](https://example.com).",
    });

    expect(payload).toEqual({
      title: "Agent finished",
      body: "Done. Updated README.md and link.",
      data: {
        serverId: "srv-1",
        workspaceId: "workspace-1",
        agentId: "agent-1",
        reason: "finished",
      },
    });
  });

  it("builds permission notifications from request details", () => {
    const payload = buildAgentAttentionNotificationPayload({
      reason: "permission",
      serverId: "srv-2",
      workspaceId: "workspace-2",
      agentId: "agent-2",
      permissionRequest: {
        id: "perm-1",
        provider: "claude",
        name: "exec",
        kind: "tool",
        title: "**Approve command**",
        description: "Run `git push`",
      },
    });

    expect(payload).toEqual({
      title: "Agent needs permission",
      body: "Approve command - Run git push",
      data: {
        serverId: "srv-2",
        workspaceId: "workspace-2",
        agentId: "agent-2",
        reason: "permission",
      },
    });
  });

  it("includes the tool input when a permission has a reason but no title", () => {
    const payload = buildAgentAttentionNotificationPayload({
      reason: "permission",
      serverId: "srv-1",
      workspaceId: "workspace-1",
      agentId: "agent-1",
      permissionRequest: {
        id: "perm-1",
        provider: "claude",
        name: "Bash",
        kind: "tool",
        input: { command: "echo hello" },
        description: "Hook requires approval",
      },
    });

    expect(payload.body).toBe('{"command":"echo hello"} - Hook requires approval');
  });

  it("uses error-specific defaults when reason is error", () => {
    const payload = buildAgentAttentionNotificationPayload({
      reason: "error",
      serverId: "srv-3",
      workspaceId: "workspace-3",
      agentId: "agent-3",
    });

    expect(payload).toEqual({
      title: "Agent needs attention",
      body: "Encountered an error.",
      data: {
        serverId: "srv-3",
        workspaceId: "workspace-3",
        agentId: "agent-3",
        reason: "error",
      },
    });
  });

  it("uses a custom message as the body under the reason's fixed title", () => {
    const base = { serverId: "srv-4", workspaceId: "workspace-4", agentId: "agent-4" };
    const error = buildAgentAttentionNotificationPayload({
      ...base,
      reason: "error",
      customMessage: "The **nightly build** failed on `main`.",
    });
    const finished = buildAgentAttentionNotificationPayload({
      ...base,
      reason: "finished",
      assistantMessage: "The agent's own last message.",
      customMessage: "Review is ready.",
    });
    const permission = buildAgentAttentionNotificationPayload({
      ...base,
      reason: "permission",
      permissionRequest: {
        id: "perm-4",
        provider: "claude",
        name: "Bash",
        kind: "tool",
        title: "Approve command",
      },
      customMessage: "Deploy is waiting on you.",
    });

    expect(error).toEqual({
      title: "Agent needs attention",
      body: "The nightly build failed on main.",
      data: { ...base, reason: "error" },
    });
    expect([finished.title, finished.body]).toEqual(["Agent finished", "Review is ready."]);
    expect([permission.title, permission.body]).toEqual([
      "Agent needs permission",
      "Deploy is waiting on you.",
    ]);
  });

  it("truncates a long custom message and falls back to the fixed body for a blank one", () => {
    const base = { serverId: "srv-5", workspaceId: "workspace-5", agentId: "agent-5" };
    const long = buildAgentAttentionNotificationPayload({
      ...base,
      reason: "error",
      customMessage: "word ".repeat(100),
    });
    const blank = buildAgentAttentionNotificationPayload({
      ...base,
      reason: "finished",
      assistantMessage: "The agent's own last message.",
      customMessage: "   ",
    });

    expect(long.body).toHaveLength(220);
    expect(long.body.endsWith("...")).toBe(true);
    expect(blank.body).toBe("Finished working.");
  });
});

describe("findLatestAssistantMessageFromTimeline", () => {
  it("joins the latest contiguous assistant chunks", () => {
    expect(
      findLatestAssistantMessageFromTimeline([
        { type: "user_message", text: "start" },
        { type: "assistant_message", text: "Part " },
        { type: "assistant_message", text: "one" },
        { type: "reasoning", text: "thinking..." },
        { type: "assistant_message", text: "Done " },
        { type: "assistant_message", text: "now" },
      ]),
    ).toBe("Done now");
  });
});

describe("findLatestPermissionRequest", () => {
  it("returns the most recently inserted request", () => {
    const pending = new Map([
      ["first", { id: "first", provider: "claude", name: "a", kind: "tool" } as const],
      ["second", { id: "second", provider: "claude", name: "b", kind: "tool" } as const],
    ]);

    expect(findLatestPermissionRequest(pending)?.id).toBe("second");
  });
});

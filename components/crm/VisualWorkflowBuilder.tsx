"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Play, Save, Plus } from "lucide-react";
import { toast } from "sonner";
import { compileGraphToRule, type WorkflowNode } from "@/lib/crm/workflowGraph";
import { RULE_TRIGGERS, RULE_ENTITIES, RULE_OPERATORS, RULE_ACTIONS } from "@/lib/crm/automationVocabulary";

/**
 * Visual ERP Builder (6.10) — a React Flow drag-and-drop canvas that is a
 * visual layer over the SAME AutomationRule backend the form builder uses.
 * Nodes carry their own config (selects); compileGraphToRule turns the graph
 * into the exact POST /api/crm/automations payload. The form-based builder
 * (NewAutomationRuleModal) remains as an alternate entry point.
 */

type NodeUpdater = (id: string, patch: Record<string, unknown>) => void;

// Small labelled select used inside nodes.
function NodeSelect({ value, options, onChange }: { value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="nodrag w-full text-xs bg-neutral-950 border border-neutral-700 rounded px-1.5 py-1 text-neutral-100"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TriggerNode({ id, data }: NodeProps) {
  const d = data as any;
  const update: NodeUpdater = d.onChange;
  return (
    <div className="rounded-lg border-2 border-purple-500/60 bg-neutral-900 p-3 w-56 shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-2">When (Trigger)</p>
      <label className="text-[10px] text-neutral-500">Entity</label>
      <NodeSelect value={d.entity} options={RULE_ENTITIES} onChange={(v) => update(id, { entity: v })} />
      <label className="text-[10px] text-neutral-500 mt-2 block">Trigger</label>
      <NodeSelect value={d.trigger} options={RULE_TRIGGERS} onChange={(v) => update(id, { trigger: v })} />
      <Handle type="source" position={Position.Right} className="!bg-purple-500" />
    </div>
  );
}

function ConditionNode({ id, data }: NodeProps) {
  const d = data as any;
  const update: NodeUpdater = d.onChange;
  return (
    <div className="rounded-lg border-2 border-amber-500/60 bg-neutral-900 p-3 w-56 shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-2">If (Condition)</p>
      <input
        value={d.field}
        onChange={(e) => update(id, { field: e.target.value })}
        placeholder="field, e.g. stage"
        className="nodrag w-full text-xs bg-neutral-950 border border-neutral-700 rounded px-1.5 py-1 text-neutral-100 mb-1"
      />
      <NodeSelect value={d.operator} options={RULE_OPERATORS} onChange={(v) => update(id, { operator: v })} />
      <input
        value={d.value}
        onChange={(e) => update(id, { value: e.target.value })}
        placeholder="value"
        className="nodrag w-full text-xs bg-neutral-950 border border-neutral-700 rounded px-1.5 py-1 text-neutral-100 mt-1"
      />
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
      <Handle type="source" position={Position.Right} className="!bg-amber-500" />
    </div>
  );
}

function ActionNode({ id, data }: NodeProps) {
  const d = data as any;
  const update: NodeUpdater = d.onChange;
  return (
    <div className="rounded-lg border-2 border-emerald-500/60 bg-neutral-900 p-3 w-56 shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-2">Then (Action)</p>
      <NodeSelect value={d.actionType} options={RULE_ACTIONS} onChange={(v) => update(id, { actionType: v })} />
      <textarea
        value={d.payload}
        onChange={(e) => update(id, { payload: e.target.value })}
        placeholder='payload JSON, e.g. {"title":"Follow up"}'
        rows={2}
        className="nodrag w-full text-xs bg-neutral-950 border border-neutral-700 rounded px-1.5 py-1 text-neutral-100 mt-1 font-mono"
      />
      <Handle type="target" position={Position.Left} className="!bg-emerald-500" />
    </div>
  );
}

let nodeSeq = 100;
const nextId = () => `n${nodeSeq++}`;

export default function VisualWorkflowBuilder() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Patch a node's data by id (bound into each node so its selects update state).
  const updateNodeData = useCallback<NodeUpdater>((id, patch) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, [setNodes]);

  const nodeTypes = useMemo(() => ({ trigger: TriggerNode, condition: ConditionNode, action: ActionNode }), []);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true }, eds)), [setEdges]);

  const addNode = useCallback((kind: "trigger" | "condition" | "action") => {
    const id = nextId();
    const base = { id, type: kind, position: { x: 80 + Math.random() * 200, y: 60 + Math.random() * 200 }, data: { onChange: updateNodeData } as Record<string, unknown> };
    if (kind === "trigger") base.data = { ...base.data, kind: "trigger", trigger: "record_created", entity: "Lead" };
    if (kind === "condition") base.data = { ...base.data, kind: "condition", field: "", operator: "equals", value: "" };
    if (kind === "action") base.data = { ...base.data, kind: "action", actionType: "create_task", payload: "" };
    setNodes((nds) => [...nds, base as Node]);
  }, [setNodes, updateNodeData]);

  // Convert the React Flow nodes to the pure compiler's shape.
  const toWorkflowNodes = (): WorkflowNode[] =>
    nodes.map((n) => {
      const d = n.data as any;
      if (d.kind === "action") return { id: n.id, data: { kind: "action", actionType: d.actionType, payload: d.payload } };
      if (d.kind === "condition") return { id: n.id, data: { kind: "condition", field: d.field, operator: d.operator, value: d.value } };
      return { id: n.id, data: { kind: "trigger", trigger: d.trigger, entity: d.entity } };
    });

  const publish = async () => {
    const compiled = compileGraphToRule(name, toWorkflowNodes());
    // strictNullChecks is off in this project — narrow on "rule" in compiled.
    if (!("rule" in compiled)) { toast.error(compiled.error); return; }
    if (compiled.warnings.length) compiled.warnings.forEach((w) => toast.warning(w));
    setSaving(true);
    try {
      const res = await fetch("/api/crm/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...compiled.rule, enabled: false }),
      });
      const json = await res.json();
      if (res.ok && json.success !== false) {
        toast.success(`Workflow "${compiled.rule.name}" published (disabled — enable it from the list).`);
      } else {
        toast.error(json.message || "Failed to publish workflow.");
      }
    } catch {
      toast.error("Failed to publish workflow.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workflow name"
          className="text-sm bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-neutral-100 flex-1 min-w-[180px]"
        />
        <Button variant="outline" onClick={() => addNode("trigger")} className="h-8 text-xs border-purple-700/50"><Plus className="w-3 h-3 mr-1" /> Trigger</Button>
        <Button variant="outline" onClick={() => addNode("condition")} className="h-8 text-xs border-amber-700/50"><Plus className="w-3 h-3 mr-1" /> Condition</Button>
        <Button variant="outline" onClick={() => addNode("action")} className="h-8 text-xs border-emerald-700/50"><Plus className="w-3 h-3 mr-1" /> Action</Button>
        <Button onClick={publish} disabled={saving} className="h-8 text-xs bg-primary"><Save className="w-3 h-3 mr-1" /> {saving ? "Publishing…" : "Publish Workflow"}</Button>
      </div>
      <div className="flex-1 border border-neutral-800 rounded-xl overflow-hidden" style={{ minHeight: 420 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable className="!bg-neutral-900" />
        </ReactFlow>
      </div>
      {nodes.length === 0 && (
        <p className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
          <Play className="w-3 h-3" /> Add a Trigger, optional Conditions, and at least one Action, connect them, then Publish. Same engine as the form builder — these become real executing rules.
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  CheckSquare,
  Plus,
  Sparkles,
  Calendar,
  User as UserIcon,
  MoreVertical,
  Search,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";

export default function TasksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tasks, setTasks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "kanban">("grid");
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "todo",
    assignmentType: "user",
    assignee: "",
    assignedDepartment: "",
    dueDate: "",
  });
  const [aiGoal, setAiGoal] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [generatedTasks, setGeneratedTasks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  const departments = ["Sales", "Finance", "Inventory", "Manufacturing"];

  useEffect(() => {
    fetchTasks();
    fetchUsers();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await fetch("/api/admin/tasks");
      const data = await response.json();
      if (response.ok) {
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const handleAiBreakdown = async () => {
    if (!aiGoal.trim()) return;
    setIsAiLoading(true);
    try {
      const response = await fetch("/api/admin/tasks/ai-breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: aiGoal }),
      });
      const data = await response.json();

      if (response.ok && data.tasks) {
        setGeneratedTasks(data.tasks);
        toast.success("AI Suggestions Ready", {
          description: `Generated ${data.tasks.length} subtasks. Click to add them.`,
        });
      }
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAddGeneratedTask = (task: any) => {
    setNewTask({
      ...newTask,
      title: task.title,
      description: task.description,
      priority: task.priority || "medium",
    });
  };

  const handleCreateTask = async () => {
    try {
      const method = editingTask ? "PUT" : "POST";
      const body = editingTask ? { ...newTask, _id: editingTask._id } : newTask;

      const response = await fetch("/api/admin/tasks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast.success(editingTask ? "Task Updated" : "Task Created", {
          description: editingTask
            ? "Task updated successfully."
            : "New task added successfully.",
        });
        setIsDialogOpen(false);
        setEditingTask(null);
        setNewTask({
          title: "",
          description: "",
          priority: "medium",
          status: "todo",
          assignmentType: "user",
          assignee: "",
          assignedDepartment: "",
          dueDate: "",
        });
        fetchTasks();
      }
    } catch (error) {
      toast.error("Failed to save task.");
    }
  };

  const handleEditTask = (task: any) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      assignmentType: task.assignmentType || "user",
      assignee: task.assignee?._id || "",
      assignedDepartment: task.assignedDepartment || "",
      dueDate: task.dueDate
        ? new Date(task.dueDate).toISOString().split("T")[0]
        : "",
    });
    setIsDialogOpen(true);
  };

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      const response = await fetch("/api/admin/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: taskId, status: newStatus }),
      });

      if (response.ok) {
        toast.success("Status Updated", {
          description: "Task status updated successfully.",
        });
        fetchTasks();
      }
    } catch (error) {
      toast.error("Failed to update status.");
    }
  };

  const onDragEnd = async (result: any) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;

    // Optimistic update
    const updatedTasks = tasks.map((t) =>
      t._id === draggableId ? { ...t, status: newStatus } : t
    );
    setTasks(updatedTasks);

    await handleUpdateStatus(draggableId, newStatus);
  };

  const getFilteredAndSortedTasks = () => {
    let filtered = tasks.filter((task) => {
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesAssignee =
        filterAssignee === "all" || task.assignee?._id === filterAssignee;

      const matchesDepartment =
        filterDepartment === "all" ||
        task.assignedDepartment === filterDepartment;

      const matchesDate =
        !filterDate ||
        (task.dueDate &&
          new Date(task.dueDate).toISOString().split("T")[0] === filterDate);

      return (
        matchesSearch && matchesAssignee && matchesDepartment && matchesDate
      );
    });

    return filtered.sort((a, b) => {
      if (sortBy === "createdAt")
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      if (sortBy === "dueDate")
        return (
          new Date(a.dueDate || 9999999999999).getTime() -
          new Date(b.dueDate || 9999999999999).getTime()
        );
      if (sortBy === "priority") {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (
          (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) -
          (priorityOrder[b.priority as keyof typeof priorityOrder] || 2)
        );
      }
      if (sortBy === "assignee") {
        const nameA = a.assignee?.name || "Unassigned";
        const nameB = b.assignee?.name || "Unassigned";
        return nameA.localeCompare(nameB);
      }
      if (sortBy === "department") {
        const deptA = a.assignedDepartment || "No Dept";
        const deptB = b.assignedDepartment || "No Dept";
        return deptA.localeCompare(deptB);
      }
      return 0;
    });
  };

  const isOverdue = (dateString?: string) => {
    if (!dateString) return false;
    return (
      new Date(dateString) < new Date() &&
      new Date(dateString).toDateString() !== new Date().toDateString()
    );
  };

  // ... existing handleAddGeneratedTask

  if (status === "loading") return <FullPageLoadingSkeleton />;

  const filteredTasks = getFilteredAndSortedTasks();

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin Dashboard"
      pageName="Tasks"
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Tasks" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      profilePath="/admin/profile"
    >
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-foreground">Task Management</h2>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="w-full md:w-[130px] h-9">
                  <UserIcon className="mr-2 h-3 w-3" />
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filterDepartment}
                onValueChange={setFilterDepartment}
              >
                <SelectTrigger className="w-full md:w-[130px] h-9">
                  <Sparkles className="mr-2 h-3 w-3" />
                  <SelectValue placeholder="Dept" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Depts</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full md:w-[130px] h-9"
              />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full md:w-[130px] h-9">
                <ArrowUpDown className="mr-2 h-3 w-3" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Newest</SelectItem>
                <SelectItem value="dueDate">Due Date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="assignee">Assignee</SelectItem>
                <SelectItem value="department">Department</SelectItem>
              </SelectContent>
            </Select>
            <div className="bg-secondary/50 p-1 rounded-lg flex items-center gap-1">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="h-8 px-2"
              >
                Grid
              </Button>
              <Button
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("kanban")}
                className="h-8 px-2"
              >
                Kanban
              </Button>
            </div>
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setEditingTask(null);
                  setNewTask({
                    title: "",
                    description: "",
                    priority: "medium",
                    status: "todo",
                    assignmentType: "user",
                    assignee: "",
                    assignedDepartment: "",
                    dueDate: "",
                  });
                }
              }}
            >
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9 w-full md:w-auto">
                  <Plus className="mr-2 h-4 w-4" /> New Task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingTask ? "Edit Task" : "Create New Task"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {!editingTask && (
                    <div className="bg-muted/50 p-3 rounded-lg border">
                      <label className="text-xs font-medium text-blue-400 mb-2 flex items-center gap-2">
                        <Sparkles className="h-3 w-3" /> AI Task Breakdown
                      </label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g., Launch Summer Sale"
                          value={aiGoal}
                          onChange={(e) => setAiGoal(e.target.value)}
                          className="text-sm"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleAiBreakdown}
                          disabled={isAiLoading}
                        >
                          {isAiLoading ? "..." : "Generate"}
                        </Button>
                      </div>

                      {generatedTasks.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Suggested Tasks:
                          </p>
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                            {generatedTasks.map((task, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between bg-secondary/50 p-2 rounded text-xs border border-border/50"
                              >
                                <div>
                                  <p className="font-medium text-foreground">
                                    {task.title}
                                  </p>
                                  <p className="text-muted-foreground line-clamp-1">
                                    {task.description}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 hover:bg-blue-600 hover:text-white"
                                  onClick={() => handleAddGeneratedTask(task)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label>Title</label>
                    <Input
                      value={newTask.title}
                      onChange={(e) =>
                        setNewTask({ ...newTask, title: e.target.value })
                      }
                      className=""
                    />
                  </div>
                  <div className="space-y-2">
                    <label>Description</label>
                    <Textarea
                      value={newTask.description}
                      onChange={(e) =>
                        setNewTask({ ...newTask, description: e.target.value })
                      }
                      className=""
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label>Priority</label>
                      <Select
                        value={newTask.priority}
                        onValueChange={(val) =>
                          setNewTask({ ...newTask, priority: val })
                        }
                      >
                        <SelectTrigger className="">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label>Status</label>
                      <Select
                        value={newTask.status}
                        onValueChange={(val) =>
                          setNewTask({ ...newTask, status: val })
                        }
                      >
                        <SelectTrigger className="">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">To Do</SelectItem>
                          <SelectItem value="in_progress">
                            In Progress
                          </SelectItem>
                          <SelectItem value="review">Review</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label>Due Date (Optional)</label>
                    <Input
                      type="date"
                      value={newTask.dueDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) =>
                        setNewTask({ ...newTask, dueDate: e.target.value })
                      }
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <label>Assign To</label>
                    <Select
                      value={newTask.assignmentType}
                      onValueChange={(val) =>
                        setNewTask({
                          ...newTask,
                          assignmentType: val,
                          assignee: "",
                          assignedDepartment: "",
                        })
                      }
                    >
                      <SelectTrigger className="">
                        <SelectValue placeholder="Select assignment type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Specific User</SelectItem>
                        <SelectItem value="department">Department</SelectItem>
                        <SelectItem value="all">All Users</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {newTask.assignmentType === "user" && (
                    <div className="space-y-2">
                      <label>Select User</label>
                      <Select
                        value={newTask.assignee}
                        onValueChange={(val) =>
                          setNewTask({ ...newTask, assignee: val })
                        }
                      >
                        <SelectTrigger className="">
                          <SelectValue placeholder="Select a user" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map((user) => (
                            <SelectItem key={user._id} value={user._id}>
                              {user.name} ({user.role || "No Dept"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {newTask.assignmentType === "department" && (
                    <div className="space-y-2">
                      <label>Select Department</label>
                      <Select
                        value={newTask.assignedDepartment}
                        onValueChange={(val) =>
                          setNewTask({ ...newTask, assignedDepartment: val })
                        }
                      >
                        <SelectTrigger className="">
                          <SelectValue placeholder="Select a department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept} value={dept}>
                              {dept}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateTask}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {editingTask ? "Update Task" : "Create Task"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map((task) => (
              <Card
                key={task._id}
                className={`hover:border-border transition-colors group relative ${
                  isOverdue(task.dueDate) && task.status !== "done"
                    ? "border-red-500/50 hover:border-red-500"
                    : ""
                }`}
              >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleEditTask(task)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-base font-medium pr-6">
                    {task.title}
                  </CardTitle>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      task.priority === "urgent"
                        ? "bg-red-900/50 text-red-400"
                        : task.priority === "high"
                        ? "bg-orange-900/50 text-orange-400"
                        : "bg-blue-900/50 text-blue-400"
                    }`}
                  >
                    {task.priority}
                  </span>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {task.description}
                  </p>
                  <div className="mb-3 space-y-2">
                    {task.assignmentType === "all" ? (
                      <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-1 rounded">
                        All Users
                      </span>
                    ) : task.assignmentType === "department" ? (
                      <span className="text-xs bg-purple-900/30 text-purple-400 px-2 py-1 rounded">
                        Dept: {task.assignedDepartment}
                      </span>
                    ) : (
                      <span className="text-xs bg-accent text-foreground px-2 py-1 rounded flex items-center gap-1 w-fit">
                        <UserIcon className="h-3 w-3" />
                        {task.assignee?.name || "Unassigned"}
                      </span>
                    )}
                    {task.dueDate && (
                      <div
                        className={`flex items-center gap-1 text-xs ${
                          isOverdue(task.dueDate) && task.status !== "done"
                            ? "text-red-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isOverdue(task.dueDate) && task.status !== "done" ? (
                          <AlertCircle className="h-3 w-3" />
                        ) : (
                          <Calendar className="h-3 w-3" />
                        )}
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground mt-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created: {new Date(task.createdAt).toLocaleDateString()}
                    </span>
                    <Select
                      value={task.status}
                      onValueChange={(val) => handleUpdateStatus(task._id, val)}
                    >
                      <SelectTrigger className="h-6 w-[100px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredTasks.length === 0 && !isLoading && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No tasks found matching your criteria.</p>
              </div>
            )}
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[calc(100vh-200px)] overflow-x-auto">
              {["todo", "in_progress", "review", "done"].map((status) => (
                <Droppable key={status} droppableId={status}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="bg-secondary/20 rounded-lg p-4 flex flex-col h-full"
                    >
                      <h3 className="font-semibold mb-4 capitalize flex items-center justify-between">
                        {status.replace("_", " ")}
                        <span className="text-xs bg-secondary px-2 py-1 rounded-full">
                          {tasks.filter((t) => t.status === status).length}
                        </span>
                      </h3>
                      <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                        {tasks
                          .filter((task) => task.status === status)
                          .map((task, index) => (
                            <Draggable
                              key={task._id}
                              draggableId={task._id}
                              index={index}
                            >
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                >
                                  <Card
                                    className={`hover:border-border transition-colors group relative bg-background ${
                                      isOverdue(task.dueDate) &&
                                      task.status !== "done"
                                        ? "border-red-500/50"
                                        : ""
                                    }`}
                                  >
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleEditTask(task)}
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <CardHeader className="p-3 pb-0">
                                      <CardTitle className="text-sm font-medium pr-6">
                                        {task.title}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-2">
                                      <div className="flex justify-between items-center mb-2">
                                        <span
                                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                            task.priority === "urgent"
                                              ? "bg-red-900/50 text-red-400"
                                              : task.priority === "high"
                                              ? "bg-orange-900/50 text-orange-400"
                                              : "bg-blue-900/50 text-blue-400"
                                          }`}
                                        >
                                          {task.priority}
                                        </span>
                                        {task.dueDate && (
                                          <span
                                            className={`text-[10px] flex items-center gap-1 ${
                                              isOverdue(task.dueDate)
                                                ? "text-red-400"
                                                : "text-muted-foreground"
                                            }`}
                                          >
                                            {isOverdue(task.dueDate) && (
                                              <AlertCircle className="h-2 w-2" />
                                            )}
                                            {new Date(
                                              task.dueDate
                                            ).toLocaleDateString(undefined, {
                                              month: "short",
                                              day: "numeric",
                                            })}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                        {task.description}
                                      </p>
                                    </CardContent>
                                  </Card>
                                </div>
                              )}
                            </Draggable>
                          ))}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
        )}
      </div>
    </DashboardLayout>
  );
}

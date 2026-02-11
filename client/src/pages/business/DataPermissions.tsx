import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface Role { id: string; name: string; description: string; userCount: number; }
interface Permission { resource: string; read: boolean; write: boolean; delete: boolean; export: boolean; }

const MOCK_ROLES: Role[] = [
  { id: "R-001", name: "系统管理员", description: "拥有所有权限", userCount: 2 },
  { id: "R-002", name: "运维工程师", description: "设备管理和诊断权限", userCount: 5 },
  { id: "R-003", name: "数据分析师", description: "数据查询和导出权限", userCount: 3 },
  { id: "R-004", name: "只读用户", description: "仅查看权限", userCount: 10 },
];

const RESOURCES = ["设备数据", "诊断结果", "知识库", "模型管理", "审计日志", "系统配置", "数据导出", "插件管理"];

export default function DataPermissions() {
  const [selectedRole, setSelectedRole] = useState("R-001");
  

  const getPerms = (roleId: string): Record<string, Permission> => {
    const base: Record<string, Permission> = {};
    RESOURCES.forEach(r => {
      if (roleId === "R-001") base[r] = { resource: r, read: true, write: true, delete: true, export: true };
      else if (roleId === "R-002") base[r] = { resource: r, read: true, write: ["设备数据", "诊断结果"].includes(r), delete: false, export: ["设备数据", "诊断结果"].includes(r) };
      else if (roleId === "R-003") base[r] = { resource: r, read: true, write: false, delete: false, export: true };
      else base[r] = { resource: r, read: true, write: false, delete: false, export: false };
    });
    return base;
  };

  const perms = getPerms(selectedRole);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">数据权限管理</h1>
        <p className="text-muted-foreground mt-1">配置角色的数据访问权限矩阵</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {MOCK_ROLES.map(role => (
          <Card key={role.id} className={`cursor-pointer transition-colors ${selectedRole === role.id ? "border-primary" : ""}`} onClick={() => setSelectedRole(role.id)}>
            <CardContent className="pt-6">
              <div className="font-medium">{role.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{role.description}</div>
              <div className="text-sm mt-2">{role.userCount} 用户</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>权限矩阵 - {MOCK_ROLES.find(r => r.id === selectedRole)?.name}</CardTitle><CardDescription>配置该角色对各资源的访问权限</CardDescription></div>
            <Button onClick={() => toast.success("功能开发中")}>保存更改</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50"><th className="p-3 text-left">资源</th><th className="p-3 text-center">读取</th><th className="p-3 text-center">写入</th><th className="p-3 text-center">删除</th><th className="p-3 text-center">导出</th></tr></thead>
              <tbody>
                {Object.values(perms).map(p => (
                  <tr key={p.resource} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{p.resource}</td>
                    <td className="p-3 text-center"><Checkbox checked={p.read} /></td>
                    <td className="p-3 text-center"><Checkbox checked={p.write} /></td>
                    <td className="p-3 text-center"><Checkbox checked={p.delete} /></td>
                    <td className="p-3 text-center"><Checkbox checked={p.export} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

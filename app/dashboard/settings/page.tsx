import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Settings, User, Shield, Store } from "lucide-react"
import { SimpleLayout } from "@/components/simple-layout"

export default function SettingsPage() {
  // Mock user data
  const user = {
    first_name: "Demo",
    last_name: "User",
    email: "demo@mrlube.com",
    role: "employee",
    store_id: "store-1",
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-800"
      case "manager":
        return "bg-blue-100 text-blue-800"
      case "employee":
        return "bg-green-100 text-green-800"
      case "trainee":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getRolePermissions = (role: string) => {
    switch (role) {
      case "admin":
        return [
          "Access all stores and locations",
          "Manage all users and roles",
          "View system-wide analytics",
          "Configure training programs",
          "Send notifications to all users",
        ]
      case "manager":
        return [
          "Manage users in assigned store",
          "View store training progress",
          "Approve training completions",
          "Send notifications to team members",
        ]
      case "employee":
        return [
          "Access personal training program",
          "Complete training tasks",
          "View personal progress",
          "Receive notifications",
        ]
      case "trainee":
        return [
          "Access personal training program",
          "Complete training tasks",
          "View personal progress",
          "Receive notifications",
        ]
      default:
        return []
    }
  }

  return (
    <SimpleLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-primary">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage your account settings and preferences</p>
        </div>

        {/* User Profile */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profile Information
            </CardTitle>
            <CardDescription>Your account details and role information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="bg-accent text-accent-foreground w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl">
                {user.first_name[0]}
                {user.last_name[0]}
              </div>
              <div>
                <h3 className="text-xl font-semibold">
                  {user.first_name} {user.last_name}
                </h3>
                <p className="text-muted-foreground">{user.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={getRoleBadgeColor(user.role)}>
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Role & Permissions */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Role & Permissions
            </CardTitle>
            <CardDescription>Your access level and what you can do in the system</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Current Role</h4>
                <Badge className={`${getRoleBadgeColor(user.role)} text-base px-3 py-1`}>
                  {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                </Badge>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Permissions</h4>
                <ul className="space-y-2">
                  {getRolePermissions(user.role).map((permission, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      {permission}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Store Information */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              Store Assignment
            </CardTitle>
            <CardDescription>Your assigned Mr. Lube location</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">You are assigned to store ID: {user.store_id}</p>
          </CardContent>
        </Card>

        {/* System Information */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              System Information
            </CardTitle>
            <CardDescription>Application details and support</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Application:</span>
              <span>Mr. Lube Training System</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Version:</span>
              <span>1.0.0</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Support:</span>
              <span>Contact your manager or IT support</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </SimpleLayout>
  )
}

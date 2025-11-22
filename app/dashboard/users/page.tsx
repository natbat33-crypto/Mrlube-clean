import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Users, Plus, Mail } from "lucide-react"
import { SimpleLayout } from "@/components/simple-layout"

export default function UsersPage() {
  // Mock team data
  const teamMembers = [
    {
      id: 1,
      first_name: "John",
      last_name: "Smith",
      email: "john.smith@mrlube.com",
      role: "employee",
      completion_percentage: 85,
      completed_tasks: 17,
      total_tasks: 20,
    },
    {
      id: 2,
      first_name: "Sarah",
      last_name: "Johnson",
      email: "sarah.johnson@mrlube.com",
      role: "trainee",
      completion_percentage: 60,
      completed_tasks: 12,
      total_tasks: 20,
    },
    {
      id: 3,
      first_name: "Mike",
      last_name: "Davis",
      email: "mike.davis@mrlube.com",
      role: "employee",
      completion_percentage: 95,
      completed_tasks: 19,
      total_tasks: 20,
    },
  ]

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
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

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600"
    if (percentage >= 50) return "text-yellow-600"
    return "text-red-600"
  }

  return (
    <SimpleLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary">Team Management</h1>
            <p className="text-muted-foreground mt-2">Manage your team members and monitor their training progress</p>
          </div>
          <Button className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            Invite Team Member
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{teamMembers.length}</p>
                  <p className="text-sm text-muted-foreground">Total Team Members</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="bg-green-100 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {teamMembers.filter((u) => u.completion_percentage >= 80).length}
                  </p>
                  <p className="text-sm text-muted-foreground">On Track</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="bg-yellow-100 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">
                    {teamMembers.filter((u) => u.completion_percentage >= 50 && u.completion_percentage < 80).length}
                  </p>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="bg-red-100 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">
                    {teamMembers.filter((u) => u.completion_percentage < 50).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Needs Attention</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Members List */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>View and manage your team's training progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamMembers.map((member) => (
                <div key={member.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-accent text-accent-foreground w-12 h-12 rounded-full flex items-center justify-center font-semibold">
                        {member.first_name[0]}
                        {member.last_name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold">
                            {member.first_name} {member.last_name}
                          </p>
                          <Badge className={getRoleBadgeColor(member.role)}>{member.role}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {member.email}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className={`font-semibold ${getProgressColor(member.completion_percentage)}`}>
                          {member.completion_percentage}%
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.completed_tasks}/{member.total_tasks} tasks
                        </p>
                      </div>
                      <div className="w-32">
                        <Progress value={member.completion_percentage} className="h-2" />
                      </div>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </SimpleLayout>
  )
}

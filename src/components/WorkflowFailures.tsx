import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExternalLink, AlertCircle } from "lucide-react";

const WorkflowFailures = () => {
  // Mock data - replace with actual GitHub API calls
  const failures = [
    {
      id: 1,
      repo: "org/repo-1",
      workflow: "CI",
      failedAt: "2024-03-20T10:00:00Z",
      url: "https://github.com/org/repo-1/actions/runs/123",
    },
    {
      id: 2,
      repo: "org/repo-2",
      workflow: "Deploy",
      failedAt: "2024-03-20T09:30:00Z",
      url: "https://github.com/org/repo-2/actions/runs/456",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Workflow Failures</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {failures.map((failure) => (
            <Alert key={failure.id} variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="font-semibold">
                {failure.repo} - {failure.workflow}
              </AlertTitle>
              <AlertDescription className="flex justify-between items-center">
                <span>Failed at {new Date(failure.failedAt).toLocaleString()}</span>
                <a
                  href={failure.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-sm hover:underline"
                >
                  View Run <ExternalLink className="ml-1 h-4 w-4" />
                </a>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkflowFailures;
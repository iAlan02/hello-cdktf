import { Construct } from "constructs";
import { App, TerraformStack, TerraformOutput } from "cdktf";
import {
  AwsProvider,
  IamRole,
  LambdaFunction,
  ApiGatewayRestApi,
  ApiGatewayResource,
  ApiGatewayMethod,
  ApiGatewayIntegration,
  ApiGatewayDeployment,
  LambdaPermission,
} from "./.gen/providers/aws";


class MyStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, "aws", {
      region: "us-west-1",
      accessKey: "fake_access_key",
      secretKey: "fake_secret_key",
      s3ForcePathStyle: true,
      skipCredentialsValidation: true,
      skipMetadataApiCheck: true,
      skipRequestingAccountId: true,
      endpoints: [
        {
          ec2: "http://localhost:4566",
          lambda: "http://localhost:4566",
          iam: "http://localhost:4566",
          apigateway: "http://localhost:4566",
        },
      ],
    });

    const aws_iam_role = new IamRole(this, "ia-role-for-lambda", {
      name: "iam_hello_role",
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Principal: {
              Service: "lambda.amazonaws.com",
            },
            Effect: "Allow",
            Sid: "",
          },
        ],
      }),
    });

    const lambda = new LambdaFunction(this, "hello-cdktf", {
      filename: process.cwd() + "/lambda.zip",
      functionName: "hello-world",
      handler: "hello-world.handler",
      runtime: "nodejs14.x",
      role: aws_iam_role.arn,
    });


    const restApi = new ApiGatewayRestApi(this, "hello-api", {
      name: "HelloApi",
      description: "API to call Hello World",
    });

    const resource = new ApiGatewayResource(this, "hello-resource", {
      restApiId: restApi.id,
      parentId: restApi.rootResourceId,
      pathPart: "{proxy+}",
    });

    const method = new ApiGatewayMethod(this, "hello-method", {
      restApiId: restApi.id,
      resourceId: resource.id,
      httpMethod: "ANY",
      authorization: "NONE",
    });

    const integration = new ApiGatewayIntegration(this, "hello-integration", {
      restApiId: restApi.id,
      resourceId: resource.id,
      httpMethod: method.httpMethod,
      integrationHttpMethod: "POST",
      type: "AWS",
      uri: lambda.invokeArn,
    });

    const proxy_method = new ApiGatewayMethod(this, "proxy-root", {
      restApiId: restApi.id,
      resourceId: resource.id,
      httpMethod: "ANY",
      authorization: "NONE",
    });

    const lambda_root = new ApiGatewayIntegration(this, "lambda-root", {
      restApiId: restApi.id,
      resourceId: proxy_method.resourceId,
      httpMethod: proxy_method.httpMethod,

      integrationHttpMethod: "POST",
      type: "AWS_PROXY",
      uri: lambda.invokeArn,
    });

    const deployment = new ApiGatewayDeployment(this, "hello-deployment", {
      restApiId: restApi.id,
      dependsOn: [integration, lambda_root],
      stageName: "test",
    });

    new LambdaPermission(this, "hello-permission", {
      statementId: "AllowAPIGatewayInvoke",
      action: "lambda:InvokeFunction",
      functionName: lambda.functionName,
      principal: "apigateway.amazonaws.com",
      sourceArn: restApi.executionArn + "/*/*/*",
    });

    new TerraformOutput(this, "endpoint", {
      value: deployment.invokeUrl,
    });
  }
}

const app = new App();
new MyStack(app, "cdktf-tutorial");
app.synth();

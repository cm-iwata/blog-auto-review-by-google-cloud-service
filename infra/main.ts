import { App } from "cdktf";
import { BlogAutoReviewStack } from "./stacks/blog-auto-review-stack";
import { getConfig } from "./config";

const app = new App();
const config = getConfig();
new BlogAutoReviewStack(app, "blog_auto_review", { ...config });
app.synth();

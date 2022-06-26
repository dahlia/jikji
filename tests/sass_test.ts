import { assertEquals$ } from "./asserts.ts";
import { Content } from "../content.ts";
import {
  CSS_MEDIA_TYPE,
  Options,
  REQUIRED_PERMISSIONS,
  sass,
  SCSS_MEDIA_TYPE,
} from "../sass.ts";

Deno.test({
  name: "sass()",
  permissions: REQUIRED_PERMISSIONS,
  async fn() {
    const compileSass = sass(
      { outputStyle: "compressed", asString: true } as Options,
    );
    const d = new Date();
    const scss = new Content("p{a{color:red}}", SCSS_MEDIA_TYPE, null, d);
    const css = compileSass(scss);
    await assertEquals$(
      css,
      new Content("p a{color:red}", CSS_MEDIA_TYPE, null, d),
    );
  },
});

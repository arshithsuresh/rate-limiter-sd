import app from "./app";
import config from "./config/config";

app.listen(config.port, () => {
  console.log(
    `Test server running on PORT : ${config.port} :: MODE ${config.nodeEnv}`
  );
});

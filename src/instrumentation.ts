export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { gitcoinGrantsRoundsRefs, refreshApplications } = await import(
      "./applications"
    );

    async function update() {
      try {
        await refreshApplications(gitcoinGrantsRoundsRefs);
        console.log("Update successful");
      } catch (error) {
        console.error("Error during update:", error);
      } finally {
        setTimeout(update, 86400000); // 86400000 ms = 24 hours
      }
    }

    update();
  }
}

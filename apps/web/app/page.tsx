import Link from "next/link";
import { Button } from "@repo/ui/button";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Wavy Live</h1>
        <p className={styles.description}>
          Your platform for seamless live streaming and watching
        </p>

        <div className={styles.ctas}>
          <Link href="/watch" passHref>
            <Button className={styles.primary}>
              Watch Stream
            </Button>
          </Link>
          
          <Link href="/broadcast" passHref>
            <Button className={styles.secondary}>
              Start Broadcasting
            </Button>
          </Link>
        </div>
      </main>
      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} Wavy Live. All rights reserved.</p>
      </footer>
    </div>
  );
}
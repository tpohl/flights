import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Observable } from 'rxjs';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth'
import User = firebase.User;
import GoogleAuthProvider = firebase.auth.GoogleAuthProvider;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {

  private user: Observable<User>;
  private userDetails: User = null;

  constructor(public afAuth: AngularFireAuth, private router: Router) {
    this.user = afAuth.authState;
    this.user.subscribe(
      (user) => {
        if (user) {
          this.userDetails = user;
          console.log(this.userDetails);
        } else {
          this.userDetails = null;
        }
      }
    );
  }
  login() {
    this.afAuth.signInWithPopup(new GoogleAuthProvider());
  }
  logout() {
    this.afAuth.signOut().then((res) => this.router.navigate(['/']));
  }

  isLoggedIn() {
    if (this.userDetails == null) {
      return false;
    } else {
      return true;
    }
  }
}

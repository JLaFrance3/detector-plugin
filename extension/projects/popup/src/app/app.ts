import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'aid-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}

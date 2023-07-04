import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlightTileComponent } from './flight-tile.component';

describe('FlightTileComponent', () => {
  let component: FlightTileComponent;
  let fixture: ComponentFixture<FlightTileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FlightTileComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlightTileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
